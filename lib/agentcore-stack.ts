import * as cdk from 'aws-cdk-lib';
import * as agentcore from 'aws-cdk-lib/aws-bedrockagentcore';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface AgentCoreStackProps extends cdk.StackProps {
  readonly databricksEndpoint: string;
  readonly oauthProviderArn: string;
  readonly cognitoUserPoolId?: string;
  readonly cognitoRegion?: string;
}

export class AgentCoreStack extends cdk.Stack {
  public readonly gateway: agentcore.CfnGateway;
  public readonly gatewayTarget: agentcore.CfnGatewayTarget;

  constructor(scope: Construct, id: string, props: AgentCoreStackProps) {
    super(scope, id, props);

    // IAM role for the AgentCore Gateway
    const gatewayRole = new iam.Role(this, 'AgentCoreGatewayRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      inlinePolicies: {
        GatewayPolicy: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                'bedrock:InvokeModel',
                'secretsmanager:GetSecretValue',
              ],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // AgentCore Gateway resource — MCP protocol type
    const cognitoRegion = props.cognitoRegion || cdk.Stack.of(this).region;
    const cognitoUserPoolId = props.cognitoUserPoolId || 'placeholder';
    const discoveryUrl = `https://cognito-idp.${cognitoRegion}.amazonaws.com/${cognitoUserPoolId}/.well-known/openid-configuration`;

    this.gateway = new agentcore.CfnGateway(this, 'AgentCoreGateway', {
      name: 'agentcore-mcp-gateway',
      authorizerType: 'CUSTOM_JWT',
      authorizerConfiguration: {
        customJwtAuthorizer: {
          discoveryUrl,
          allowedAudience: [cognitoUserPoolId],
        },
      },
      protocolType: 'MCP',
      roleArn: gatewayRole.roleArn,
      description: 'AgentCore Gateway for Databricks MCP server integration',
    });

    // MCP server target pointing to the Databricks endpoint
    this.gatewayTarget = new agentcore.CfnGatewayTarget(this, 'DatabricksMcpTarget', {
      name: 'databricks-mcp-server',
      gatewayIdentifier: this.gateway.attrGatewayIdentifier,
      targetConfiguration: {
        mcp: {
          mcpServer: {
            endpoint: props.databricksEndpoint,
          },
        },
      },
      credentialProviderConfigurations: [
        {
          credentialProviderType: 'OAUTH',
          credentialProvider: {
            oauthCredentialProvider: {
              providerArn: props.oauthProviderArn,
              scopes: ['all-apis'],
              grantType: 'CLIENT_CREDENTIALS',
            },
          },
        },
      ],
      description: 'Databricks-hosted MCP server for legacy data extraction and custom tool integrations',
    });

    new cdk.CfnOutput(this, 'GatewayId', {
      value: this.gateway.attrGatewayIdentifier,
      exportName: 'AgentCoreGatewayId',
    });

    new cdk.CfnOutput(this, 'GatewayTargetId', {
      value: this.gatewayTarget.attrTargetId,
      exportName: 'AgentCoreGatewayTargetId',
    });
  }
}
