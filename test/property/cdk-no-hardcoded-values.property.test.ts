import { describe, expect } from 'vitest';
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
 * Synthesize all stacks and return their templates as JSON objects.
 * Stacks are created WITHOUT an explicit `env`, so CDK resolves
 * `this.account` and `this.region` to CloudFormation pseudo-references
 * (AWS::AccountId, AWS::Region) rather than literal values.
 */
function synthesizeAllTemplates(context: {
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

  return [
    { name: 'AuthStack', template: Template.fromStack(authStack) },
    { name: 'StorageStack', template: Template.fromStack(storageStack) },
    { name: 'ComputeStack', template: Template.fromStack(computeStack) },
    { name: 'AgentsStack', template: Template.fromStack(agentsStack) },
    { name: 'GatewayStack', template: Template.fromStack(gatewayStack) },
    { name: 'AgentCoreStack', template: Template.fromStack(agentCoreStack) },
    { name: 'ObservabilityStack', template: Template.fromStack(observabilityStack) },
  ];
}

/**
 * Strip known parameterized prop values from a template JSON string.
 * These are values injected via stack props (not hardcoded in stack code),
 * so they should not trigger false positives.
 */
function stripParameterizedValues(json: string, propsToStrip: string[]): string {
  let result = json;
  for (const prop of propsToStrip) {
    // Replace all occurrences of the prop value with a placeholder
    result = result.split(prop).join('__PARAMETERIZED__');
  }
  return result;
}

// 12-digit AWS account ID pattern — standalone, not embedded in longer
// alphanumeric strings (CDK logical IDs contain hex hashes that can
// include 12-digit numeric subsequences like "708463110181" inside
// "AgentCoreApiDeployment449252CBffc708463110181b71eb587eead2eb54").
// We use word-boundary-aware lookbehind/lookahead to exclude those.
const AWS_ACCOUNT_ID_PATTERN = /(?<![a-zA-Z0-9])\d{12}(?![a-zA-Z0-9])/;

// AWS region pattern — matches region strings like us-east-1, eu-west-2
const AWS_REGION_PATTERN = /\b(us|eu|ap|sa|ca|me|af)-(north|south|east|west|central|northeast|southeast|northwest|southwest)-[1-9]\b/;

// Databricks URL pattern
const DATABRICKS_URL_PATTERN = /https?:\/\/[^\s"]*databricks[^\s"]*/i;

// Arbitraries
const databricksEndpointArb = fc
  .tuple(
    fc.stringMatching(/^[a-z]{3,10}$/),
    fc.constantFrom('.cloud.databricks.com', '.azuredatabricks.net', '.gcp.databricks.com'),
  )
  .map(([workspace, domain]) => `https://${workspace}${domain}/api/mcp`);

const accountIdArb = fc.stringMatching(/^[0-9]{12}$/);
const regionArb = fc.constantFrom('us-east-1', 'us-west-2', 'eu-west-1', 'ap-southeast-1', 'sa-east-1');

const oauthArnArb = fc
  .tuple(regionArb, accountIdArb, fc.stringMatching(/^[a-zA-Z0-9-]{4,16}$/))
  .map(([region, account, name]) => `arn:aws:secretsmanager:${region}:${account}:secret:${name}`);

const agentIdArb = fc.stringMatching(/^[A-Z0-9]{10}$/);

const contextArb = fc.record({
  databricksEndpoint: databricksEndpointArb,
  oauthProviderArn: oauthArnArb,
  supervisorAgentId: agentIdArb,
  supervisorAgentAliasId: agentIdArb,
});

// Feature: agentcore-bedrock-platform, Property 13: No hardcoded environment values in CDK
// **Validates: Requirements 8.4**
describe('Property 13: No hardcoded environment values in CDK', () => {
  test.prop([contextArb], { numRuns: 100, timeout: 120_000 })(
    'synthesized templates contain no hardcoded account IDs, region strings, or Databricks URLs',
    (context) => {
      const templates = synthesizeAllTemplates(context);

      // Values that are legitimately injected via parameterized props
      const parameterizedValues = [
        context.databricksEndpoint,
        context.oauthProviderArn,
        context.supervisorAgentId,
        context.supervisorAgentAliasId,
      ];

      for (const { name, template } of templates) {
        const rawJson = JSON.stringify(template.toJSON());

        // Strip out known parameterized prop values to avoid false positives
        const sanitizedJson = stripParameterizedValues(rawJson, parameterizedValues);

        // 1. No hardcoded 12-digit AWS account IDs in template bodies
        expect(
          sanitizedJson,
          `${name} contains a hardcoded AWS account ID`,
        ).not.toMatch(AWS_ACCOUNT_ID_PATTERN);

        // 2. No hardcoded AWS region strings in template bodies
        expect(
          sanitizedJson,
          `${name} contains a hardcoded AWS region string`,
        ).not.toMatch(AWS_REGION_PATTERN);

        // 3. No hardcoded Databricks URLs in template bodies
        expect(
          sanitizedJson,
          `${name} contains a hardcoded Databricks URL`,
        ).not.toMatch(DATABRICKS_URL_PATTERN);
      }
    },
  );
});
