import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import {
  aws_lambda as lambda,
  custom_resources as cr,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { SignalCatalog } from './signalcatalog';

export class VehicleInterface {
  protected intf: object;

  constructor() {
    this.intf = {};
  }

  toObject(): object {
    return (this.intf);
  }
}

export class CanVehicleInterface extends VehicleInterface {
  constructor(
    interfaceId: string,
    name: string) {
    super();

    this.intf = {
      type: 'CAN_INTERFACE',
      interfaceId,
      canInterface: {
        canInterfaceName: name,
        protocolName: 'CAN',
        protocolVersion: '2.0b',
      },
    };
  }
}

export class VehicleSignal {
  protected signal: object;

  constructor() {
    this.signal = {};
  }

  toObject(): object {
    return (this.signal);
  }
}

export class CanVehicleSignal extends VehicleSignal {
  constructor(
    name: string,
    fullyQualifiedName: string,
    interfaceId: string,
    messageId: number,
    factor: number,
    isBigEndian: boolean,
    isSigned: boolean,
    length: number,
    offset: number,
    startBit: number) {
    super();

    this.signal = {
      type: 'CAN_SIGNAL',
      fullyQualifiedName,
      interfaceId,
      canSignal: {
        canSignalName: name,
        factor,
        isBigEndian,
        isSigned,
        length,
        messageId,
        offset,
        startBit,
      },
    };
  }
}

export interface IVehicleModel {
  signalCatalog: SignalCatalog;
  name: string;
  description?: string;
  networkInterfaces: VehicleInterface[];
  signals: VehicleSignal[];

}

export class VehicleModel extends Construct {
  readonly name: string;
  readonly description: (string|undefined);
  readonly signalCatalog: SignalCatalog;

  constructor(scope: Construct, id: string, props: IVehicleModel) {
    super(scope, id);

    this.name = props.name;
    this.signalCatalog = props.signalCatalog;

    const onEventHandler = new lambda.Function(this, 'Lambda', {
      code: lambda.AssetCode.fromAsset(path.join(__dirname, '/../src/handlers')),
      handler: 'vehiclemodelhandler.on_event',
      timeout: cdk.Duration.seconds(300),
      runtime: lambda.Runtime.PYTHON_3_9,
      layers: [this.signalCatalog.lambdaLayer],
      role: this.signalCatalog.lambdaRole,
    });


    const provider = new cr.Provider(this, 'Provider', {
      onEventHandler: onEventHandler,
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      serviceToken: provider.serviceToken,
      properties: {
        name: this.name,
        signal_catalog_arn: props.signalCatalog.arn,
        model_manifest_arn: `arn:aws:iotfleetwise:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:model-manifest/${this.name}`,
        description: props.description,
        network_interfaces: JSON.stringify(props.networkInterfaces.map(i => i.toObject())),
        signals: JSON.stringify(props.signals.map(s => s.toObject())),
      },
    });

    resource.node.addDependency(this.signalCatalog);
  }
}