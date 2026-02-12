import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface GatewayStackProps extends cdk.StackProps {
  readonly userPool: cognito.IUserPool;
  readonly supervisorAgentId: string;
  readonly supervisorAgentAliasId: string;
}

export class GatewayStack extends cdk.Stack {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, props: GatewayStackProps) {
    super(scope, id, props);

    this.api = new apigateway.RestApi(this, 'AgentCoreApi', {
      restApiName: 'agentcore-api',
      description: 'API Gateway for AgentCore Bedrock agent invocation',
      deployOptions: {
        stageName: 'prod',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['POST', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key'],
      },
    });

    // Cognito authorizer for JWT validation
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'CognitoAuthorizer', {
      cognitoUserPools: [props.userPool as cognito.UserPool],
      authorizerName: 'agentcore-cognito-authorizer',
    });

    // IAM role for API Gateway to invoke Bedrock agent
    const apiGatewayRole = new iam.Role(this, 'ApiGatewayBedrockRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      inlinePolicies: {
        InvokeBedrockAgent: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['bedrock:InvokeAgent'],
              resources: [
                `arn:aws:bedrock:${this.region}:${this.account}:agent-alias/${props.supervisorAgentId}/${props.supervisorAgentAliasId}`,
              ],
            }),
          ],
        }),
      },
    });

    // POST /agent/invoke — uses HTTP_PROXY integration to Bedrock runtime
    const bedrockEndpoint = `https://bedrock-agent-runtime.${this.region}.amazonaws.com/agents/${props.supervisorAgentId}/agentAliases/${props.supervisorAgentAliasId}/sessions/{sessionId}/text`;

    const agentResource = this.api.root.addResource('agent');
    const invokeResource = agentResource.addResource('invoke');

    invokeResource.addMethod(
      'POST',
      new apigateway.HttpIntegration(bedrockEndpoint, {
        httpMethod: 'POST',
        options: {
          credentialsRole: apiGatewayRole,
          requestParameters: {
            'integration.request.path.sessionId': 'context.requestId',
          },
          integrationResponses: [
            {
              statusCode: '200',
            },
            {
              selectionPattern: '4\\d{2}',
              statusCode: '400',
              responseTemplates: {
                'application/json': '{"error": "Bad request"}',
              },
            },
            {
              selectionPattern: '5\\d{2}',
              statusCode: '503',
              responseTemplates: {
                'application/json': '{"error": "Service unavailable"}',
              },
            },
          ],
        },
        proxy: false,
      }),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
        methodResponses: [
          { statusCode: '200' },
          { statusCode: '400' },
          { statusCode: '503' },
        ],
      },
    );

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: this.api.url,
      exportName: 'AgentCoreApiUrl',
    });
  }
}
