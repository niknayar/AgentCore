import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';

export interface ObservabilityStackProps extends cdk.StackProps {
  readonly businessLogicFunction: lambda.IFunction;
  readonly api: apigateway.RestApi;
}

export class ObservabilityStack extends cdk.Stack {
  public readonly dashboard: cloudwatch.Dashboard;
  public readonly lambdaErrorAlarm: cloudwatch.Alarm;
  public readonly apiGateway5xxAlarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props: ObservabilityStackProps) {
    super(scope, id, props);

    // Lambda metrics
    const lambdaErrors = props.businessLogicFunction.metricErrors({ period: cdk.Duration.minutes(5) });
    const lambdaInvocations = props.businessLogicFunction.metricInvocations({ period: cdk.Duration.minutes(5) });
    const lambdaDuration = props.businessLogicFunction.metricDuration({ period: cdk.Duration.minutes(5) });

    // API Gateway metrics
    const api5xxMetric = props.api.metricServerError({ period: cdk.Duration.minutes(5) });
    const apiCountMetric = props.api.metricCount({ period: cdk.Duration.minutes(5) });
    const apiLatencyMetric = props.api.metricLatency({ period: cdk.Duration.minutes(5) });

    // Lambda error rate alarm: > 5%
    const lambdaErrorRate = new cloudwatch.MathExpression({
      expression: '(errors / invocations) * 100',
      usingMetrics: { errors: lambdaErrors, invocations: lambdaInvocations },
      period: cdk.Duration.minutes(5),
    });

    this.lambdaErrorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorRateAlarm', {
      alarmName: 'agentcore-lambda-error-rate',
      alarmDescription: 'Lambda error rate exceeds 5%',
      metric: lambdaErrorRate,
      threshold: 5,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // API Gateway 5xx rate alarm: > 1%
    const api5xxRate = new cloudwatch.MathExpression({
      expression: '(errors5xx / totalRequests) * 100',
      usingMetrics: { errors5xx: api5xxMetric, totalRequests: apiCountMetric },
      period: cdk.Duration.minutes(5),
    });

    this.apiGateway5xxAlarm = new cloudwatch.Alarm(this, 'ApiGateway5xxRateAlarm', {
      alarmName: 'agentcore-api-5xx-rate',
      alarmDescription: 'API Gateway 5xx error rate exceeds 1%',
      metric: api5xxRate,
      threshold: 1,
      evaluationPeriods: 3,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // CloudWatch dashboard
    this.dashboard = new cloudwatch.Dashboard(this, 'AgentCoreDashboard', {
      dashboardName: 'agentcore-platform',
    });

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Lambda Invocations & Errors',
        left: [lambdaInvocations, lambdaErrors],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration',
        left: [lambdaDuration],
        width: 12,
      }),
    );

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway Requests & 5xx Errors',
        left: [apiCountMetric, api5xxMetric],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway Latency',
        left: [apiLatencyMetric],
        width: 12,
      }),
    );

    this.dashboard.addWidgets(
      new cloudwatch.AlarmWidget({
        title: 'Lambda Error Rate Alarm',
        alarm: this.lambdaErrorAlarm,
        width: 12,
      }),
      new cloudwatch.AlarmWidget({
        title: 'API Gateway 5xx Rate Alarm',
        alarm: this.apiGateway5xxAlarm,
        width: 12,
      }),
    );
  }
}
