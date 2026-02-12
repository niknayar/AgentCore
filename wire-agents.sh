#!/bin/bash
# Wire the supervisor and collaborator Bedrock agents together.
# Run this AFTER 'cdk deploy AgentsStack' completes.
#
# Usage: ./wire-agents.sh <REGION>

set -euo pipefail

REGION="${1:-us-east-1}"

echo "=== Wiring Bedrock Agent Collaboration ==="

# Get agent IDs from stack outputs
SUPERVISOR_ID=$(aws cloudformation describe-stacks --stack-name AgentsStack --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`SupervisorAgentId`].OutputValue' --output text)
COLLABORATOR_ALIAS_ARN=$(aws cloudformation describe-stacks --stack-name AgentsStack --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`CollaboratorAgentAliasArn`].OutputValue' --output text)

echo "Supervisor Agent ID: $SUPERVISOR_ID"
echo "Collaborator Alias ARN: $COLLABORATOR_ALIAS_ARN"

# Step 1: Update supervisor to SUPERVISOR_ROUTER mode
echo ""
echo "Step 1: Setting supervisor to SUPERVISOR_ROUTER mode..."
aws bedrock-agent update-agent \
  --agent-id "$SUPERVISOR_ID" \
  --agent-name "agentcore-core-gateway" \
  --foundation-model "anthropic.claude-sonnet-4-20250514-v1:0" \
  --instruction "You are the Core Gateway Agent (supervisor). Validate authenticated user identity from session attributes, route package submissions to the Gateway Target Agent collaborator, and reject unauthenticated requests." \
  --agent-collaboration "SUPERVISOR_ROUTER" \
  --agent-resource-role-arn "$(aws bedrock-agent get-agent --agent-id "$SUPERVISOR_ID" --query 'agent.agentResourceRoleArn' --output text)" \
  --region "$REGION" > /dev/null

# Step 2: Associate the collaborator
echo "Step 2: Associating collaborator with supervisor..."
aws bedrock-agent associate-agent-collaborator \
  --agent-id "$SUPERVISOR_ID" \
  --agent-version "DRAFT" \
  --agent-descriptor aliasArn="$COLLABORATOR_ALIAS_ARN" \
  --collaborator-name "GatewayTargetAgent" \
  --collaboration-instruction "Route package submissions to this collaborator for business logic processing, storage operations, and MCP server interactions." \
  --relay-conversation-history "TO_COLLABORATOR" \
  --region "$REGION" > /dev/null

# Step 3: Prepare the supervisor agent
echo "Step 3: Preparing supervisor agent..."
aws bedrock-agent prepare-agent --agent-id "$SUPERVISOR_ID" --region "$REGION" > /dev/null

echo ""
echo "=== Agent Collaboration Wired Successfully ==="
echo "The supervisor agent can now route to the collaborator."
