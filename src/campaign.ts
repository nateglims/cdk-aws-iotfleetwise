import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import {
  aws_lambda as lambda,
  custom_resources as cr,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Vehicle } from './vehicle';


export class CollectionScheme {
  protected scheme: object;

  constructor() {
    this.scheme = {};
  }

  toObject(): object {
    return (this.scheme);
  }
}

export class TimeBasedCollectionScheme extends CollectionScheme {
  constructor(
    period: cdk.Duration,
  ) {
    super();

    this.scheme = {
      timeBasedCollectionScheme: {
        periodMs: period.toMilliseconds(),
      },
    };
  }
}

export class CampaignSignal {
  private signal: object;
  constructor(
    name: string,
    maxSampleCount?: number,
    minimumSamplingInterval?: cdk.Duration) {

    this.signal = {
      signalName: name,
      ...maxSampleCount && { maxSampleCount },
      ...minimumSamplingInterval && { minimumSamplingInterval },
    };
  }

  toObject(): object {
    return (this.signal);
  }
}

export interface ICampaign {
  name: string;
  target: Vehicle;
  collectionScheme: CollectionScheme;
  signals: CampaignSignal[];
}

export class Campaign extends Construct {
  readonly name: string;
  readonly arn: string;
  readonly target: Vehicle;

  constructor(scope: Construct, id: string, props: ICampaign) {
    super(scope, id);

    this.name = props.name;
    this.arn = `arn:aws:iotfleetwise:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:vehicle/${props.target}`;
    this.target = props.target;

    const onEventHandler = new lambda.Function(this, 'Lambda', {
      code: lambda.AssetCode.fromAsset(path.join(__dirname, '/../src/handlers')),
      handler: 'campaignhandler.on_event',
      timeout: cdk.Duration.seconds(300),
      runtime: lambda.Runtime.PYTHON_3_9,
      layers: [this.target.vehicleModel.signalCatalog.lambdaLayer],
      role: this.target.vehicleModel.signalCatalog.lambdaRole,
    });


    const provider = new cr.Provider(this, 'Provider', {
      onEventHandler: onEventHandler,
    });

    const resource = new cdk.CustomResource(this, 'Resource', {
      serviceToken: provider.serviceToken,
      properties: {
        campaign_name: this.name,
        signal_catalog_arn: this.target.vehicleModel.signalCatalog.arn,
        target_arn: this.target.arn,
        collection_scheme: JSON.stringify(props.collectionScheme.toObject()),
        signals_to_collect: JSON.stringify(props.signals.map(s => s.toObject())),
      },
    });
    resource.node.addDependency(this.target);
  }
}