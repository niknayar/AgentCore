#!/bin/bash
# AgentCore Frontend - Build, Deploy to S3, and serve via CloudFront
#
# Usage: ./deploy-frontend.sh <REGION>
#
# Prerequisites:
#   - CloudFront stack already deployed (08-cloudfront-stack.json)
#   - volpe-chatbot-ui dependencies installed (npm ci)
#   - AWS CLI configured

set -euo pipefail

REGION="${1:?Provide AWS Region (e.g. us-east-1)}"

echo "=== AgentCore Frontend Deployment ==="
echo "Region: $REGION"
echo ""

# 1. Deploy the CloudFront stack
echo "--- Step 1: Deploying CloudFront stack ---"
aws cloudformation deploy \
  --template-file cloudformation/08-cloudfront-stack.json \
  --stack-name CloudFrontStack \
  --region "$REGION" \
  --no-fail-on-empty-changeset \
  2>&1 || true

# 2. Get outputs
echo ""
echo "--- Step 2: Fetching stack outputs ---"
BUCKET_NAME=$(aws cloudformation describe-stacks \
  --stack-name CloudFrontStack \
  --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`FrontendBucketName`].OutputValue' \
  --output text)

DISTRIBUTION_ID=$(aws cloudformation describe-stacks \
  --stack-name CloudFrontStack \
  --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDistributionId`].OutputValue' \
  --output text)

CF_DOMAIN=$(aws cloudformation describe-stacks \
  --stack-name CloudFrontStack \
  --region "$REGION" \
  --query 'Stacks[0].Outputs[?OutputKey==`CloudFrontDomainName`].OutputValue' \
  --output text)

echo "S3 Bucket:       $BUCKET_NAME"
echo "Distribution ID: $DISTRIBUTION_ID"
echo "CloudFront URL:  https://$CF_DOMAIN"

# 3. Build the frontend
echo ""
echo "--- Step 3: Building frontend ---"
cd ../volpe-chatbot-ui
npm run build
cd ../AgentCore

# 4. Upload to S3
echo ""
echo "--- Step 4: Uploading to S3 ---"
aws s3 sync ../volpe-chatbot-ui/dist/ "s3://${BUCKET_NAME}/" \
  --delete \
  --region "$REGION"

# Set cache headers for hashed assets (long cache)
aws s3 cp "s3://${BUCKET_NAME}/assets/" "s3://${BUCKET_NAME}/assets/" \
  --recursive \
  --cache-control "public, max-age=31536000, immutable" \
  --metadata-directive REPLACE \
  --region "$REGION" 2>/dev/null || true

# Set short cache for index.html (so updates propagate quickly)
aws s3 cp "s3://${BUCKET_NAME}/index.html" "s3://${BUCKET_NAME}/index.html" \
  --cache-control "public, max-age=60" \
  --metadata-directive REPLACE \
  --region "$REGION"

# 5. Invalidate CloudFront cache
echo ""
echo "--- Step 5: Invalidating CloudFront cache ---"
aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION_ID" \
  --paths "/*" \
  --region "$REGION" \
  --query 'Invalidation.Id' \
  --output text

echo ""
echo "=== Frontend Deployment Complete ==="
echo ""
echo "Access the application at:"
echo "  https://${CF_DOMAIN}"
echo ""
