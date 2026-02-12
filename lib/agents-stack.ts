import * as cdk from 'aws-cdk-lib';
import * as bedrock from 'aws-cdk-lib/aws-bedrock';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface AgentsStackProps extends cdk.StackProps {
  readonly businessLogicFunction: lambda.IFunction;
}

export class AgentsStack extends cdk.Stack {
  public readonly supervisorAgent: bedrock.CfnAgent;
  public readonly supervisorAgentAlias: bedrock.CfnAgentAlias;
  public readonly collaboratorAgent: bedrock.CfnAgent;
  public readonly collaboratorAgentAlias: bedrock.CfnAgentAlias;

  constructor(scope: Construct, id: string, props: AgentsStackProps) {
    super(scope, id, props);

    // IAM role for the collaborator (target) agent
    const collaboratorRole = new iam.Role(this, 'CollaboratorAgentRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      inlinePolicies: {
        BedrockInvoke: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['bedrock:InvokeModel'],
              resources: [`arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-sonnet-*`],
            }),
            new iam.PolicyStatement({
              actions: ['lambda:InvokeFunction'],
              resources: [props.businessLogicFunction.functionArn],
            }),
          ],
        }),
      },
    });

    // Gateway Target Agent (collaborator) with action group and memory
    this.collaboratorAgent = new bedrock.CfnAgent(this, 'GatewayTargetAgent', {
      agentName: 'agentcore-gateway-target',
      foundationModel: 'anthropic.claude-sonnet-4-20250514-v1:0',
      agentResourceRoleArn: collaboratorRole.roleArn,
      instruction: 'You are the Gateway Target Agent. Orchestrate package processing by determining required steps, invoking business logic, accessing storage, querying legacy data via MCP, and executing custom tools as needed. Return consolidated results.',
      autoPrepare: true,
      actionGroups: [
        {
          actionGroupName: 'BusinessProcessing',
          actionGroupExecutor: {
            lambda: props.businessLogicFunction.functionArn,
          },
          functionSchema: {
            functions: [
              {
                name: 'evaluateSubmission',
                description: 'Evaluate a package submission against configured business rules',
                parameters: {
                  submissionId: { type: 'string', description: 'Unique submission identifier', required: true },
                  fields: { type: 'string', description: 'JSON-encoded submission fields', required: true },
                },
              },
            ],
          },
          description: 'Business processing action group for evaluating submissions via Lambda',
        },
      ],
      memoryConfiguration: {
        enabledMemoryTypes: ['SESSION_SUMMARY'],
        storageDays: 30,
        sessionSummaryConfiguration: {
          maxRecentSessions: 5,
        },
      },
    });

    // Alias for the collaborator agent
    this.collaboratorAgentAlias = new bedrock.CfnAgentAlias(this, 'CollaboratorAgentAlias', {
      agentAliasName: 'live',
      agentId: this.collaboratorAgent.attrAgentId,
    });

    // IAM role for the supervisor agent
    const supervisorRole = new iam.Role(this, 'SupervisorAgentRole', {
      assumedBy: new iam.ServicePrincipal('bedrock.amazonaws.com'),
      inlinePolicies: {
        BedrockInvoke: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ['bedrock:InvokeModel'],
              resources: [`arn:aws:bedrock:${this.region}::foundation-model/anthropic.claude-sonnet-*`],
            }),
            new iam.PolicyStatement({
              actions: ['bedrock:InvokeAgent'],
              resources: ['*'],
            }),
          ],
        }),
      },
    });

    // Core Gateway Agent (supervisor) — deployed as SUPERVISOR_ROUTER
    // but WITHOUT inline collaborators. The collaborator association
    // must be done post-deploy via the wire-agents.sh script because
    // CloudFormation creates resources asynchronously and the collaborator
    // alias isn't ready when the supervisor tries to reference it.
    this.supervisorAgent = new bedrock.CfnAgent(this, 'CoreGatewayAgent', {
      agentName: 'agentcore-core-gateway',
      foundationModel: 'anthropic.claude-sonnet-4-20250514-v1:0',
      agentResourceRoleArn: supervisorRole.roleArn,
      instruction: 'You are the Core Gateway Agent (supervisor). Validate authenticated user identity from session attributes, route package submissions to the Gateway Target Agent collaborator, and reject unauthenticated requests.',
      autoPrepare: false,
      agentCollaboration: 'DISABLED',
    });

    // Alias for the supervisor agent
    this.supervisorAgentAlias = new bedrock.CfnAgentAlias(this, 'SupervisorAgentAlias', {
      agentAliasName: 'live',
      agentId: this.supervisorAgent.attrAgentId,
    });

    // Grant Bedrock permission to invoke the Lambda
    props.businessLogicFunction.grantInvoke(new iam.ServicePrincipal('bedrock.amazonaws.com'));

    new cdk.CfnOutput(this, 'SupervisorAgentId', {
      value: this.supervisorAgent.attrAgentId,
      exportName: 'AgentCoreSupervisorAgentId',
    });

    new cdk.CfnOutput(this, 'SupervisorAgentAliasId', {
      value: this.supervisorAgentAlias.attrAgentAliasId,
      exportName: 'AgentCoreSupervisorAgentAliasId',
    });

    new cdk.CfnOutput(this, 'CollaboratorAgentId', {
      value: this.collaboratorAgent.attrAgentId,
      exportName: 'AgentCoreCollaboratorAgentId',
    });

    new cdk.CfnOutput(this, 'CollaboratorAgentAliasArn', {
      value: this.collaboratorAgentAlias.attrAgentAliasArn,
      exportName: 'AgentCoreCollaboratorAgentAliasArn',
    });
  }
}
