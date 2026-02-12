import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, it, expect } from 'vitest';
import { AuthStack } from '../../lib/auth-stack';
import { StorageStack } from '../../lib/storage-stack';

describe('AuthStack', () => {
  const app = new App();
  const stack = new AuthStack(app, 'TestAuthStack');
  const template = Template.fromStack(stack);

  it('creates a Cognito User Pool with correct password policy', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      Policies: {
        PasswordPolicy: {
          MinimumLength: 8,
          RequireUppercase: true,
          RequireLowercase: true,
          RequireNumbers: true,
          RequireSymbols: true,
        },
      },
    });
  });

  it('creates an App Client with SRP auth flow', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      ExplicitAuthFlows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
    });
  });

  it('exports User Pool ID and App Client ID', () => {
    template.hasOutput('UserPoolId', {});
    template.hasOutput('AppClientId', {});
  });
});

describe('StorageStack', () => {
  const app = new App();
  const stack = new StorageStack(app, 'TestStorageStack');
  const template = Template.fromStack(stack);

  it('creates an S3 bucket with SSE-S3 encryption and versioning', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          { ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } },
        ],
      },
      VersioningConfiguration: { Status: 'Enabled' },
    });
  });

  it('configures lifecycle rules for IA and Glacier transitions', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: [
          {
            Status: 'Enabled',
            Transitions: [
              { StorageClass: 'STANDARD_IA', TransitionInDays: 90 },
              { StorageClass: 'GLACIER', TransitionInDays: 365 },
            ],
          },
        ],
      },
    });
  });

  it('configures CORS for pre-signed uploads', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      CorsConfiguration: {
        CorsRules: [
          {
            AllowedMethods: ['GET', 'PUT', 'POST'],
            AllowedOrigins: ['*'],
            AllowedHeaders: ['*'],
            MaxAge: 3600,
          },
        ],
      },
    });
  });

  it('exports bucket name and ARN', () => {
    template.hasOutput('BucketName', {});
    template.hasOutput('BucketArn', {});
  });
});

import { ComputeStack } from '../../lib/compute-stack';
import { AgentsStack } from '../../lib/agents-stack';
import { GatewayStack } from '../../lib/gateway-stack';
import { AgentCoreStack } from '../../lib/agentcore-stack';
import { ObservabilityStack } from '../../lib/observability-stack';

describe('ComputeStack', () => {
  const app = new App();
  const storageStack = new StorageStack(app, 'TestStorageForCompute');
  const stack = new ComputeStack(app, 'TestComputeStack', {
    bucket: storageStack.bucket,
  });
  const template = Template.fromStack(stack);

  it('creates a Lambda function with Node.js 22.x runtime', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x',
    });
  });

  it('configures 30s timeout and 512MB memory', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Timeout: 30,
      MemorySize: 512,
    });
  });

  it('exports the function ARN', () => {
    template.hasOutput('BusinessLogicFunctionArn', {});
  });
});

describe('AgentsStack', () => {
  const app = new App();
  const storageStack = new StorageStack(app, 'TestStorageForAgents');
  const computeStack = new ComputeStack(app, 'TestComputeForAgents', {
    bucket: storageStack.bucket,
  });
  const stack = new AgentsStack(app, 'TestAgentsStack', {
    businessLogicFunction: computeStack.businessLogicFunction,
  });
  const template = Template.fromStack(stack);

  it('creates a collaborator Bedrock agent with memory configuration', () => {
    template.hasResourceProperties('AWS::Bedrock::Agent', {
      AgentName: 'agentcore-gateway-target',
      MemoryConfiguration: {
        EnabledMemoryTypes: ['SESSION_SUMMARY'],
        StorageDays: 30,
        SessionSummaryConfiguration: { MaxRecentSessions: 5 },
      },
    });
  });

  it('creates a supervisor Bedrock agent with SUPERVISOR_ROUTER collaboration', () => {
    template.hasResourceProperties('AWS::Bedrock::Agent', {
      AgentName: 'agentcore-core-gateway',
      AgentCollaboration: 'SUPERVISOR_ROUTER',
    });
  });

  it('creates agent aliases for both agents', () => {
    template.resourceCountIs('AWS::Bedrock::AgentAlias', 2);
  });

  it('configures BusinessProcessing action group on the collaborator', () => {
    template.hasResourceProperties('AWS::Bedrock::Agent', {
      AgentName: 'agentcore-gateway-target',
      ActionGroups: [
        {
          ActionGroupName: 'BusinessProcessing',
        },
      ],
    });
  });

  it('exports supervisor agent ID and alias ID', () => {
    template.hasOutput('SupervisorAgentId', {});
    template.hasOutput('SupervisorAgentAliasId', {});
  });
});

describe('GatewayStack', () => {
  const app = new App();
  const authStack = new AuthStack(app, 'TestAuthForGateway');
  const stack = new GatewayStack(app, 'TestGatewayStack', {
    userPool: authStack.userPool,
    supervisorAgentId: 'test-agent-id',
    supervisorAgentAliasId: 'test-alias-id',
  });
  const template = Template.fromStack(stack);

  it('creates a REST API', () => {
    template.hasResourceProperties('AWS::ApiGateway::RestApi', {
      Name: 'agentcore-api',
    });
  });

  it('creates a Cognito authorizer', () => {
    template.resourceCountIs('AWS::ApiGateway::Authorizer', 1);
  });

  it('creates a POST method', () => {
    template.hasResourceProperties('AWS::ApiGateway::Method', {
      HttpMethod: 'POST',
      AuthorizationType: 'COGNITO_USER_POOLS',
    });
  });

  it('exports the API URL', () => {
    template.hasOutput('ApiUrl', {});
  });
});

describe('AgentCoreStack', () => {
  const app = new App();
  const stack = new AgentCoreStack(app, 'TestAgentCoreStack', {
    databricksEndpoint: 'https://test.databricks.com/mcp',
    oauthProviderArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:test-oauth',
  });
  const template = Template.fromStack(stack);

  it('creates an AgentCore Gateway with MCP protocol', () => {
    template.hasResourceProperties('AWS::BedrockAgentCore::Gateway', {
      Name: 'agentcore-mcp-gateway',
      ProtocolType: 'MCP',
    });
  });

  it('creates a Gateway Target for the Databricks MCP server', () => {
    template.hasResourceProperties('AWS::BedrockAgentCore::GatewayTarget', {
      Name: 'databricks-mcp-server',
    });
  });

  it('exports gateway and target IDs', () => {
    template.hasOutput('GatewayId', {});
    template.hasOutput('GatewayTargetId', {});
  });
});

describe('ObservabilityStack', () => {
  const app = new App();
  const authStack = new AuthStack(app, 'TestAuthForObs');
  const storageStack = new StorageStack(app, 'TestStorageForObs');
  const computeStack = new ComputeStack(app, 'TestComputeForObs', {
    bucket: storageStack.bucket,
  });
  const gatewayStack = new GatewayStack(app, 'TestGatewayForObs', {
    userPool: authStack.userPool,
    supervisorAgentId: 'test-agent-id',
    supervisorAgentAliasId: 'test-alias-id',
  });
  const stack = new ObservabilityStack(app, 'TestObservabilityStack', {
    businessLogicFunction: computeStack.businessLogicFunction,
    api: gatewayStack.api,
  });
  const template = Template.fromStack(stack);

  it('creates a CloudWatch dashboard', () => {
    template.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
  });

  it('creates Lambda error rate and API Gateway 5xx rate alarms', () => {
    template.resourceCountIs('AWS::CloudWatch::Alarm', 2);
  });
});
