#!/bin/bash
# AgentCore Platform - AWS Deployment Script (IAM Role-based)
#
# Usage:
#   Step 1 (one-time): ./deploy.sh setup-role <ACCOUNT_ID> <REGION>
#   Step 2 (deploy):   ./deploy.sh deploy <ACCOUNT_ID> <REGION> <DATABRICKS_ENDPOINT>
#
# Prerequisites:
#   - AWS CLI configured with credentials that can create IAM roles
#   - CDK bootstrapped: npx cdk bootstrap aws://<ACCOUNT>/<REGION>
#   - Node.js 22+ installed

set -euo pipefail

ACTION="${1:?Usage: ./deploy.sh <setup-role|deploy> <ACCOUNT_ID> <REGION> [DATABRICKS_ENDPOINT]}"
ACCOUNT_ID="${2:?Provide AWS Account ID}"
REGION="${3:?Provide AWS Region}"

case "$ACTION" in

  setup-role)
    echo "=== Creating AgentCore Deployment IAM Role ==="
    echo "Account: $ACCOUNT_ID"
    echo "Region:  $REGION"
    echo ""

    aws cloudformation deploy \
      --template-file cloudformation/00-deployment-role.json \
      --stack-name AgentCore-DeploymentRole \
      --capabilities CAPABILITY_NAMED_IAM \
      --parameter-overrides TrustedAccountId="$ACCOUNT_ID" \
      --region "$REGION"

    ROLE_ARN=$(aws cloudformation describe-stacks \
      --stack-name AgentCore-DeploymentRole \
      --region "$REGION" \
      --query 'Stacks[0].Outputs[?OutputKey==`DeploymentRoleArn`].OutputValue' \
      --output text)

    echo ""
    echo "=== Deployment Role Created ==="
    echo "Role ARN: $ROLE_ARN"
    echo ""
    echo "Now run:"
    echo "  ./deploy.sh deploy $ACCOUNT_ID $REGION https://your-workspace.databricks.com"
    ;;

  deploy)
    DATABRICKS_ENDPOINT="${4:?Provide Databricks endpoint URL}"

    echo "=== AgentCore Platform Deployment (IAM Role) ==="
    echo "Account:    $ACCOUNT_ID"
    echo "Region:     $REGION"
    echo "Databricks: $DATABRICKS_ENDPOINT"
    echo ""

    # Fetch the deployment role ARN
    ROLE_ARN=$(aws cloudformation describe-stacks \
      --stack-name AgentCore-DeploymentRole \
      --region "$REGION" \
      --query 'Stacks[0].Outputs[?OutputKey==`DeploymentRoleArn`].OutputValue' \
      --output text 2>/dev/null || "")

    if [ -z "$ROLE_ARN" ]; then
      echo "ERROR: Deployment role not found. Run './deploy.sh setup-role $ACCOUNT_ID $REGION' first."
      exit 1
    fi

    echo "Using deployment role: $ROLE_ARN"
    echo ""

    # Install dependencies
    echo "Installing dependencies..."
    npm ci

    # Bootstrap CDK (idempotent)
    echo "Bootstrapping CDK..."
    npx cdk bootstrap "aws://${ACCOUNT_ID}/${REGION}" \
      --cloudformation-execution-policies "arn:aws:iam::aws:policy/AdministratorAccess" \
      2>/dev/null || true

    # Deploy all stacks using the IAM role
    echo ""
    echo "Deploying all stacks with IAM role..."
    npx cdk deploy --all --require-approval never \
      --role-arn "$ROLE_ARN" \
      --context account="$ACCOUNT_ID" \
      --context region="$REGION" \
      --context databricksEndpoint="$DATABRICKS_ENDPOINT"

    echo ""
    echo "=== Deployment Complete ==="
    echo ""

    # Print outputs
    echo "--- AuthStack Outputs ---"
    aws cloudformation describe-stacks --stack-name AuthStack --region "$REGION" \
      --query 'Stacks[0].Outputs' --output table 2>/dev/null || echo "(check AWS Console)"

    echo ""
    echo "--- GatewayStack Outputs ---"
    aws cloudformation describe-stacks --stack-name GatewayStack --region "$REGION" \
      --query 'Stacks[0].Outputs' --output table 2>/dev/null || echo "(check AWS Console)"

    echo ""
    echo "=== Next Steps ==="
    echo "1. Create a Cognito user:"
    echo "   aws cognito-idp admin-create-user \\"
    echo "     --user-pool-id <USER_POOL_ID> \\"
    echo "     --username <your-username> \\"
    echo "     --temporary-password 'TempPass1!' \\"
    echo "     --region $REGION"
    echo ""
    echo "2. Configure volpe-chatbot-ui/.env:"
    echo "   VITE_COGNITO_USER_POOL_ID=<USER_POOL_ID>"
    echo "   VITE_COGNITO_APP_CLIENT_ID=<APP_CLIENT_ID>"
    echo "   VITE_API_ENDPOINT=<API_GATEWAY_URL>"
    echo ""
    echo "3. Start the frontend: cd ../volpe-chatbot-ui && npm run dev"
    ;;

  *)
    echo "Unknown action: $ACTION"
    echo "Usage:"
    echo "  ./deploy.sh setup-role <ACCOUNT_ID> <REGION>"
    echo "  ./deploy.sh deploy <ACCOUNT_ID> <REGION> <DATABRICKS_ENDPOINT>"
    exit 1
    ;;
esac
