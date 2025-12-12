#!/bin/bash

# Multi-PO Support Deployment Script
# This script deploys both classification and start-processing lambdas to dev environment

set -e  # Exit on error

echo "=========================================="
echo "Multi-PO Support Deployment Script"
echo "Environment: DEV"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -d "lambda/classification" ] || [ ! -d "lambda/start-processing" ]; then
    echo "Error: Must run from project root directory"
    exit 1
fi

# Check if bio-rad-dev profile exists
if ! aws configure list-profiles | grep -q "bio-rad-dev"; then
    echo "Error: AWS profile 'bio-rad-dev' not found"
    echo "Please configure AWS credentials first"
    exit 1
fi

echo "Step 1: Deploying Classification Lambda..."
echo "=========================================="
cd lambda/classification

# Clean up
echo "Cleaning up old files..."
rm -f order-vision-classification.zip
rm -rf node_modules

# Install dependencies
echo "Installing production dependencies..."
npm ci --only=production

# Create zip
echo "Creating deployment package..."
zip -r order-vision-classification.zip node_modules .env index.mjs tracking-utils.mjs rrc-number.mjs credentials-documentai.json

# Deploy code
echo "Deploying code to AWS..."
aws lambda update-function-code \
  --region us-east-2 \
  --function-name order-vision-classification \
  --zip-file fileb://order-vision-classification.zip \
  --profile bio-rad-dev

# Update environment variables
echo "Updating environment variables (including MAX_CONCURRENT_POS=2)..."
aws lambda update-function-configuration \
  --region us-east-2 \
  --function-name order-vision-classification \
  --environment "Variables={\
BUCKET_NAME=order-vision-ai-dev,\
PINECONE_ENVIRONMENT=DEV,\
NAMESPACE=address_v7_prod_adrc,\
AZURE=true,\
VARIATION=CF-o3-mini-hi-ADDR-o3-mini-hi,\
CUSTOM_FIELDS_MODEL=o3-mini-test-2,\
ADDRESS_MODEL=o3-mini-test,\
AWS_LAMBDA_REGION=us-east-2,\
AZURE_INVOICE_PARSER_ENDPOINT=https://invoicew2-dev.cognitiveservices.azure.com/,\
TRACKING_QUEUE_URL=https://sqs.us-east-2.amazonaws.com/614250372661/order-vision-tracking-queue-dev,\
MAX_CONCURRENT_POS=2,\
AWS=true}" \
  --profile bio-rad-dev

echo "✅ Classification lambda deployed successfully!"
echo ""

# Wait for Lambda to update
echo "Waiting 5 seconds for Lambda to update..."
sleep 5

cd ../..

echo "Step 2: Deploying Start-Processing Lambda..."
echo "=========================================="
cd lambda/start-processing

# Clean up
echo "Cleaning up old files..."
rm -f order-vision-start-processing.zip
rm -rf node_modules

# Install dependencies
echo "Installing production dependencies..."
npm ci --only=production

# Create zip
echo "Creating deployment package..."
zip -r9 order-vision-start-processing.zip node_modules .env index.mjs tracking-utils.mjs invoke-auth.mjs anthropic.mjs extract-materials.mjs format-dates.mjs translate.mjs search.mjs search-material.mjs search-accountmanager.mjs search-customer.mjs knvp-check.mjs quote-number.mjs rrc-number.mjs knvp.json states.json credentials-documentai.json

# Deploy code
echo "Deploying code to AWS..."
aws lambda update-function-code \
  --region us-east-2 \
  --function-name order-vision-start-processing \
  --zip-file fileb://order-vision-start-processing.zip \
  --profile bio-rad-dev

echo "✅ Start-processing lambda deployed successfully!"
echo ""

cd ../..

echo "Step 3: Verifying Deployment..."
echo "=========================================="

# Verify classification lambda
echo "Classification Lambda Configuration:"
aws lambda get-function-configuration \
  --region us-east-2 \
  --function-name order-vision-classification \
  --profile bio-rad-dev \
  --query '{Runtime:Runtime,Timeout:Timeout,Memory:MemorySize,LastModified:LastModified,MAX_CONCURRENT_POS:Environment.Variables.MAX_CONCURRENT_POS}'

echo ""

# Verify start-processing lambda
echo "Start-Processing Lambda Configuration:"
aws lambda get-function-configuration \
  --region us-east-2 \
  --function-name order-vision-start-processing \
  --profile bio-rad-dev \
  --query '{Runtime:Runtime,Timeout:Timeout,Memory:MemorySize,LastModified:LastModified}'

echo ""
echo "=========================================="
echo "✅ Deployment Complete!"
echo "=========================================="
echo ""
echo "Next Steps:"
echo "1. Review the configuration output above"
echo "2. Verify MAX_CONCURRENT_POS=2 is set on classification lambda"
echo "3. Run end-to-end tests using TESTING.md guide"
echo "4. Monitor CloudWatch logs during testing"
echo ""
echo "To monitor logs:"
echo "  aws logs tail /aws/lambda/order-vision-classification --follow --profile bio-rad-dev"
echo "  aws logs tail /aws/lambda/order-vision-start-processing --follow --profile bio-rad-dev"
echo ""
