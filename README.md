# AgentCore Platform

A serverless AI agent platform built on AWS that connects a React frontend to Amazon Bedrock AgentCore via API Gateway and Lambda. Users authenticate with Cognito, submit package requests through a web form, and receive AI-generated responses from a hosted agent runtime.

## Architecture

```
CloudFront → S3 (React SPA)
                ↓
         API Gateway (REST)
                ↓
       Lambda (SigV4 proxy)
                ↓
     Bedrock AgentCore Runtime
```

**Key services:**
- Amazon Cognito — user authentication (USER_PASSWORD_AUTH flow)
- API Gateway — REST API with Cognito authorizer
- Lambda (Node.js 22) — signs requests with SigV4 and proxies to AgentCore
- Bedrock AgentCore — hosted agent runtime (Claude model)
- CloudFront + S3 — static frontend hosting with OAC
- CloudWatch — observability and logging

## Project Structure

```
├── AgentCore/                    # Backend infrastructure
│   ├── cloudformation/           # CloudFormation templates (00–08)
│   ├── lambda/api-proxy/         # Lambda proxy function (SigV4 → AgentCore)
│   ├── lambda/business-logic/    # Business logic Lambda
│   ├── lib/                      # CDK stack definitions
│   ├── test/                     # Unit + property-based tests
│   ├── deploy.sh                 # Backend deployment script
│   └── deploy-frontend.sh        # Frontend build + deploy to CloudFront
│
├── volpe-chatbot-ui/             # React frontend (Vite + TypeScript)
│   ├── src/auth/                 # Cognito auth (direct API, no Amplify)
│   ├── src/api/                  # Agent API client
│   ├── src/components/           # SubmissionForm, ConversationView
│   └── src/__tests__/property/   # Property-based tests (fast-check)
│
└── .kiro/specs/                  # Feature specifications
```

## Prerequisites

- Node.js 22+
- AWS CLI v2 configured with credentials
- An AWS account with Bedrock AgentCore access enabled

## Getting Started

### 1. Deploy the backend

```bash
cd AgentCore
npm ci

# One-time: create the deployment IAM role
./deploy.sh setup-role <ACCOUNT_ID> <REGION>

# Deploy all stacks
./deploy.sh deploy <ACCOUNT_ID> <REGION> <DATABRICKS_ENDPOINT>
```

### 2. Configure the frontend

Create `volpe-chatbot-ui/.env`:

```env
VITE_COGNITO_USER_POOL_ID=<your-user-pool-id>
VITE_COGNITO_APP_CLIENT_ID=<your-app-client-id>
VITE_API_ENDPOINT=<your-api-gateway-url>
```

### 3. Run locally

```bash
cd volpe-chatbot-ui
npm ci
npm run dev
```

### 4. Deploy frontend to CloudFront

```bash
cd AgentCore
./deploy-frontend.sh <REGION>
```

This builds the React app, uploads to S3, and invalidates the CloudFront cache.

## CloudFormation Stacks

| Stack | Template | Purpose |
|-------|----------|---------|
| Deployment Role | `00-deployment-role.json` | IAM role for CDK/CF deployments |
| Auth | `01-auth-stack.json` | Cognito User Pool + App Client |
| Storage | `02-storage-stack.json` | S3 buckets, DynamoDB tables |
| Compute | `03-compute-stack.json` | Lambda functions, execution roles |
| Agents | `04-agents-stack.json` | Bedrock Agent + alias configuration |
| Gateway | `05-gateway-stack.json` | API Gateway REST API + authorizer |
| AgentCore | `06-agentcore-stack.json` | AgentCore runtime configuration |
| Observability | `07-observability-stack.json` | CloudWatch dashboards, alarms |
| CloudFront | `08-cloudfront-stack.json` | CloudFront distribution + S3 origin |

## Testing

```bash
# Backend tests (unit + property-based)
cd AgentCore
npm test

# Frontend tests (unit + property-based)
cd volpe-chatbot-ui
npm test
```

Both projects use Vitest with [fast-check](https://github.com/dubzzz/fast-check) for property-based testing.

## Lambda Proxy

The `agentcore-api-proxy` Lambda handles the Browser → AgentCore bridge. It:

1. Receives POST requests from API Gateway (with Cognito ID token auth)
2. Extracts the query from the submission payload
3. Signs the request with SigV4 using the Lambda's IAM role credentials
4. Calls the Bedrock AgentCore `/runtimes/{arn}/invocations` endpoint
5. Parses the agent response and returns it to the browser

Environment variables:
- `AGENT_RUNTIME_ARN` — the AgentCore hosted runtime ARN
- `ENDPOINT_QUALIFIER` — the runtime endpoint qualifier

## Authentication Flow

The frontend authenticates directly with Cognito using `USER_PASSWORD_AUTH` via raw `fetch` calls (no Amplify SDK). Tokens are stored in `localStorage` and the ID token is sent as a `Bearer` token to API Gateway, which validates it with a Cognito User Pools authorizer.

## License

Internal project — not for public distribution.
