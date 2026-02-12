import { describe, it, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { AuthStack } from '../../lib/auth-stack';
import { StorageStack } from '../../lib/storage-stack';
import { ComputeStack } from '../../lib/compute-stack';
import { AgentsStack } from '../../lib/agents-stack';
import { GatewayStack } from '../../lib/gateway-stack';
import { AgentCoreStack } from '../../lib/agentcore-stack';
import { ObservabilityStack } from '../../lib/observability-stack';

/**
 * Helper: synthesize all stacks with the given context values and return templates.
 * Each call creates a fresh CDK App so stacks are isolated.
 */
function synthesizeAllStacks(context: {
  databricksEndpoint: string;
  oauthProviderArn: string;
  supervisorAgentId: string;
  supervisorAgentAliasId: string;
}) {
  const app = new App();

  const authStack = new AuthStack(app, 'AuthStack');
  const storageStack = new StorageStack(app, 'StorageStack');
  const computeStack = new ComputeStack(app, 'ComputeStack', {
    bucket: storageStack.bucket,
  });
  const agentsStack = new AgentsStack(app, 'AgentsStack', {
    businessLogicFunction: computeStack.businessLogicFunction,
  });
  const gatewayStack = new GatewayStack(app, 'GatewayStack', {
    userPool: authStack.userPool,
    supervisorAgentId: context.supervisorAgentId,
    supervisorAgentAliasId: context.supervisorAgentAliasId,
  });
  const agentCoreStack = new AgentCoreStack(app, 'AgentCoreStack', {
    databricksEndpoint: context.databricksEndpoint,
    oauthProviderArn: context.oauthProviderArn,
  });
  const observabilityStack = new ObservabilityStack(app, 'ObservabilityStack', {
    businessLogicFunction: computeStack.businessLogicFunction,
    api: gatewayStack.api,
  });

  return {
    auth: Template.fromStack(authStack),
    storage: Template.fromStack(storageStack),
    compute: Template.fromStack(computeStack),
    agents: Template.fromStack(agentsStack),
    gateway: Template.fromStack(gatewayStack),
    agentCore: Template.fromStack(agentCoreStack),
    observability: Template.fromStack(observabilityStack),
  };
}

// Arbitraries for context values
const endpointArb = fc.webUrl().map((url) => `${url}/mcp`);
const arnArb = fc
  .tuple(
    fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1'),
    fc.stringMatching(/^[0-9]{12}$/),
    fc.stringMatching(/^[a-zA-Z0-9-]{1,20}$/)
  )
  .map(([region, account, name]) => `arn:aws:secretsmanager:${region}:${account}:secret:${name}`);
const agentIdArb = fc.stringMatching(/^[A-Z0-9]{10}$/);

const contextArb = fc.record({
  databricksEndpoint: endpointArb,
  oauthProviderArn: arnArb,
  supervisorAgentId: agentIdArb,
  supervisorAgentAliasId: agentIdArb,
});

// Feature: agentcore-bedrock-platform, Property 12: CDK synth produces valid CloudFormation
// **Validates: Requirements 8.3**
describe('Property 12: CDK synth produces valid CloudFormation', () => {
  test.prop([contextArb], { numRuns: 100, timeout: 120_000 })(
    'all stacks synthesize without errors and contain expected resource types',
    (context) => {
      const templates = synthesizeAllStacks(context);

      // AuthStack: Cognito User Pool + Client
      templates.auth.resourceCountIs('AWS::Cognito::UserPool', 1);
      templates.auth.resourceCountIs('AWS::Cognito::UserPoolClient', 1);

      // StorageStack: S3 Bucket
      templates.storage.resourceCountIs('AWS::S3::Bucket', 1);

      // ComputeStack: Lambda Function + IAM Role
      templates.compute.hasResourceProperties('AWS::Lambda::Function', {
        Runtime: 'nodejs22.x',
      });

      // AgentsStack: Bedrock Agents + Aliases
      templates.agents.resourceCountIs('AWS::Bedrock::Agent', 2);
      templates.agents.resourceCountIs('AWS::Bedrock::AgentAlias', 2);

      // GatewayStack: REST API + Cognito Authorizer
      templates.gateway.resourceCountIs('AWS::ApiGateway::RestApi', 1);
      templates.gateway.resourceCountIs('AWS::ApiGateway::Authorizer', 1);

      // AgentCoreStack: Gateway + Gateway Target
      templates.agentCore.resourceCountIs('AWS::BedrockAgentCore::Gateway', 1);
      templates.agentCore.resourceCountIs('AWS::BedrockAgentCore::GatewayTarget', 1);

      // ObservabilityStack: Dashboard + Alarms
      templates.observability.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
      templates.observability.resourceCountIs('AWS::CloudWatch::Alarm', 2);
    }
  );
});
