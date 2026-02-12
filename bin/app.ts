#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AuthStack } from '../lib/auth-stack';
import { StorageStack } from '../lib/storage-stack';
import { ComputeStack } from '../lib/compute-stack';
import { AgentsStack } from '../lib/agents-stack';
import { GatewayStack } from '../lib/gateway-stack';
import { AgentCoreStack } from '../lib/agentcore-stack';
import { ObservabilityStack } from '../lib/observability-stack';

const app = new cdk.App();

const account = app.node.tryGetContext('account') || process.env.CDK_DEFAULT_ACCOUNT;
const region = app.node.tryGetContext('region') || process.env.CDK_DEFAULT_REGION;
const databricksEndpoint = app.node.tryGetContext('databricksEndpoint');
const oauthProviderArn = app.node.tryGetContext('oauthProviderArn') || `arn:aws:secretsmanager:${region}:${account}:secret:databricks-oauth`;

const env: cdk.Environment = { account, region };

// AuthStack: Cognito User Pool + App Client
const authStack = new AuthStack(app, 'AuthStack', { env });

// StorageStack: S3 bucket with lifecycle policies
const storageStack = new StorageStack(app, 'StorageStack', { env });

// ComputeStack: Lambda ← StorageStack (S3 bucket)
const computeStack = new ComputeStack(app, 'ComputeStack', {
  env,
  bucket: storageStack.bucket,
});
computeStack.addDependency(storageStack);

// AgentsStack: Bedrock agents ← ComputeStack (Lambda ARN)
const agentsStack = new AgentsStack(app, 'AgentsStack', {
  env,
  businessLogicFunction: computeStack.businessLogicFunction,
});
agentsStack.addDependency(computeStack);

// GatewayStack: API Gateway ← AuthStack (Cognito) + AgentsStack (agent IDs)
const gatewayStack = new GatewayStack(app, 'GatewayStack', {
  env,
  userPool: authStack.userPool,
  supervisorAgentId: agentsStack.supervisorAgent.attrAgentId,
  supervisorAgentAliasId: agentsStack.supervisorAgentAlias.attrAgentAliasId,
});
gatewayStack.addDependency(authStack);
gatewayStack.addDependency(agentsStack);

// AgentCoreStack: MCP Gateway — depends on AuthStack for Cognito User Pool ID
const agentCoreStack = new AgentCoreStack(app, 'AgentCoreStack', {
  env,
  databricksEndpoint,
  oauthProviderArn,
  cognitoUserPoolId: authStack.userPool.userPoolId,
  cognitoRegion: region as string,
});
agentCoreStack.addDependency(authStack);

// ObservabilityStack: CloudWatch ← ComputeStack (Lambda) + GatewayStack (API)
const observabilityStack = new ObservabilityStack(app, 'ObservabilityStack', {
  env,
  businessLogicFunction: computeStack.businessLogicFunction,
  api: gatewayStack.api,
});
observabilityStack.addDependency(computeStack);
observabilityStack.addDependency(gatewayStack);

app.synth();
