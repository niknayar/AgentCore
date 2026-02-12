import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { Construct } from 'constructs';

export interface ComputeStackProps extends cdk.StackProps {
  readonly bucket: s3.IBucket;
}

export class ComputeStack extends cdk.Stack {
  public readonly businessLogicFunction: lambda.Function;

  constructor(scope: Construct, id: string, props: ComputeStackProps) {
    super(scope, id, props);

    this.businessLogicFunction = new lambda.Function(this, 'BusinessLogicFunction', {
      functionName: 'agentcore-business-logic',
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '..', 'lambda', 'business-logic')),
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        BUCKET_NAME: props.bucket.bucketName,
      },
    });

    // Grant S3 read/write — least-privilege scoped to the specific bucket
    props.bucket.grantReadWrite(this.businessLogicFunction);

    new cdk.CfnOutput(this, 'BusinessLogicFunctionArn', {
      value: this.businessLogicFunction.functionArn,
      exportName: 'AgentCoreBusinessLogicFunctionArn',
    });
  }
}
