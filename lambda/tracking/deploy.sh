#!/bin/bash

# Order Vision Tracking System Deployment Script
# Usage: ./deploy.sh [environment] [region] [existing_role_arn]
# Example: ./deploy.sh dev us-east-2
# Example: ./deploy.sh dev us-east-2 arn:aws:iam::614250372661:role/service-role/custom-role

set -e

ENVIRONMENT=${1:-dev}
REGION=${2:-us-east-2}
EXISTING_ROLE_ARN=${3:-arn:aws:iam::614250372661:role/service-role/order-vision-upload-role-hv9lejlk}

# Validate environment
if [[ ! "$ENVIRONMENT" =~ ^(dev|qa|prod)$ ]]; then
    echo "Error: Environment must be dev, qa, or prod"
    exit 1
fi

# Set bucket name based on environment
case $ENVIRONMENT in
    dev)
        BUCKET_NAME="order-vision-ai-dev"
        ;;
    qa)
        BUCKET_NAME="order-vision-ai-qa"
        ;;
    prod)
        BUCKET_NAME="order-vision-ai-prod"
        ;;
esac

echo "🚀 Deploying Order Vision Tracking System"
echo "Environment: $ENVIRONMENT"
echo "Region: $REGION"
echo "Bucket: $BUCKET_NAME"
echo "IAM Role: $EXISTING_ROLE_ARN"
echo ""

# Check if SAM CLI is installed
if ! command -v sam &> /dev/null; then
    echo "❌ SAM CLI is not installed. Please install it first:"
    echo "https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/serverless-sam-cli-install.html"
    exit 1
fi

# Check if AWS CLI is configured
if ! aws sts get-caller-identity --profile bio-rad-dev &> /dev/null; then
    echo "❌ AWS CLI is not configured or bio-rad-dev profile is invalid"
    exit 1
fi

echo "✅ Prerequisites check passed"
echo ""

# Build the application
echo "📦 Building SAM application..."
sam build --region $REGION

if [ $? -ne 0 ]; then
    echo "❌ Build failed"
    exit 1
fi

echo "✅ Build completed"
echo ""

# Deploy the application
echo "🚀 Deploying to $ENVIRONMENT..."

# Set AWS profile based on environment
case $ENVIRONMENT in
    dev)
        AWS_PROFILE="bio-rad-dev"
        ;;
    qa)
        AWS_PROFILE="bio-rad-qa"
        ;;
    prod)
        AWS_PROFILE="bio-rad-prod"
        ;;
esac

echo "AWS Profile: $AWS_PROFILE"

# Check if this is the first deployment
STACK_NAME="order-vision-tracking-$ENVIRONMENT"
if aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --profile $AWS_PROFILE &> /dev/null; then
    echo "📝 Updating existing stack..."
    sam deploy \
        --region $REGION \
        --profile $AWS_PROFILE \
        --stack-name $STACK_NAME \
        --parameter-overrides \
            Environment=$ENVIRONMENT \
            BucketName=$BUCKET_NAME \
            ExistingRoleArn=$EXISTING_ROLE_ARN \
        --no-confirm-changeset \
        --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
        --resolve-s3
else
    echo "🆕 Creating new stack..."
    sam deploy \
        --region $REGION \
        --profile $AWS_PROFILE \
        --stack-name $STACK_NAME \
        --parameter-overrides \
            Environment=$ENVIRONMENT \
            BucketName=$BUCKET_NAME \
            ExistingRoleArn=$EXISTING_ROLE_ARN \
        --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
        --no-confirm-changeset \
        --resolve-s3
fi

if [ $? -ne 0 ]; then
    echo "❌ Deployment failed"
    exit 1
fi

echo "✅ Deployment completed successfully!"
echo ""

# Get stack outputs
echo "📋 Stack Outputs:"
aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --region $REGION \
    --profile $AWS_PROFILE \
    --query 'Stacks[0].Outputs[*].[OutputKey,OutputValue]' \
    --output text \
    --no-paginate

echo ""
echo "🎉 Order Vision Tracking System deployed successfully!"
echo ""
echo "Next steps:"
echo "1. Update existing lambda environment variables with TRACKING_QUEUE_URL"
echo "2. Add tracking-utils.mjs to existing lambda packages"
echo "3. Integrate tracking calls in existing lambda functions"
echo "4. Test the tracking system with a sample upload"
echo ""
echo "Monitoring:"
echo "- Tracking Lambda logs: /aws/lambda/order-vision-tracking-$ENVIRONMENT"
echo "- Monitoring Lambda logs: /aws/lambda/order-vision-monitoring-$ENVIRONMENT"
echo "- DynamoDB table: order-vision-tracking-$ENVIRONMENT"
echo "- SQS queue: order-vision-tracking-queue-$ENVIRONMENT"
