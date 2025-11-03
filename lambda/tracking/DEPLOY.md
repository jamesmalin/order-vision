# Order Vision Tracking System - Deployment Guide

## 🚨 Deployment Policy

**IMPORTANT**: All development and testing should be done in the **DEV environment only**. 

- ✅ **DEV**: Always deploy here for development and testing
- ❌ **QA**: Only deploy after thorough testing in DEV and approval
- ❌ **PROD**: Only deploy after QA validation and formal approval process

## 🔧 Prerequisites

### 1. AWS CLI Profiles
Ensure you have the following AWS CLI profiles configured:
```bash
aws configure --profile bio-rad-dev
aws configure --profile bio-rad-qa  
aws configure --profile bio-rad-prod
```

### 2. Required Tools
- AWS CLI v2+
- SAM CLI
- Node.js 22.x

### 3. Verify Access
```bash
aws sts get-caller-identity --profile bio-rad-dev
```

## 🚀 Development Deployment (Default)

### Quick Deploy to DEV
```bash
cd lambda/tracking
./deploy.sh
```

This will automatically:
- Build the SAM application
- Deploy to **dev environment** using `bio-rad-dev` profile
- Use `order-vision-ai-dev` S3 bucket
- Create stack: `order-vision-tracking-dev`

### Manual Deploy to DEV
```bash
cd lambda/tracking
./deploy.sh dev us-east-2
```

## 📋 Post-Deployment Steps

### 1. Get Queue URL
After deployment, note the `TrackingQueueUrl` from the CloudFormation outputs:
```bash
aws cloudformation describe-stacks \
    --stack-name order-vision-tracking-dev \
    --region us-east-2 \
    --profile bio-rad-dev \
    --query 'Stacks[0].Outputs[?OutputKey==`TrackingQueueUrl`].OutputValue' \
    --output text
```

### 2. Update Existing Lambda Environment Variables
Add to all existing lambdas in DEV:
```
TRACKING_QUEUE_URL=<queue-url-from-above>
```

### 3. Test the Deployment
```bash
# Test tracking lambda
sam local invoke TrackingFunction -e test-events/upload-event.json

# Test monitoring lambda
sam local invoke MonitoringFunction -e test-events/monitoring-event.json
```

## 🧪 Development Workflow

### Making Changes
1. **Always work in DEV first**
2. Make your code changes
3. Deploy to DEV: `./deploy.sh`
4. Test thoroughly in DEV environment
5. Only after DEV testing is complete, consider QA deployment

### Testing Checklist
- [ ] Tracking events are stored in DynamoDB
- [ ] Alerts are sent to Teams via cloudwatch-alerts
- [ ] Monitoring lambda runs without errors
- [ ] SQS queue processes messages correctly
- [ ] CloudWatch logs show expected output

## ⚠️ QA Deployment (Restricted)

**Only deploy to QA after:**
- ✅ Thorough testing in DEV
- ✅ Code review approval
- ✅ Stakeholder sign-off

```bash
# QA deployment (use with caution)
./deploy.sh qa us-east-2
```

## 🔒 Production Deployment (Highly Restricted)

**Only deploy to PROD after:**
- ✅ Successful QA deployment and testing
- ✅ Formal change management approval
- ✅ Scheduled maintenance window
- ✅ Rollback plan prepared

```bash
# Production deployment (requires formal approval)
./deploy.sh prod us-east-2
```

## 🔍 Monitoring Deployment

### Check Stack Status
```bash
aws cloudformation describe-stacks \
    --stack-name order-vision-tracking-dev \
    --region us-east-2 \
    --profile bio-rad-dev \
    --query 'Stacks[0].StackStatus'
```

### View Logs
```bash
# Tracking lambda logs
aws logs tail /aws/lambda/order-vision-tracking-dev --follow --profile bio-rad-dev

# Monitoring lambda logs  
aws logs tail /aws/lambda/order-vision-monitoring-dev --follow --profile bio-rad-dev
```

### Check Resources
```bash
# DynamoDB table
aws dynamodb describe-table \
    --table-name order-vision-tracking-dev \
    --profile bio-rad-dev

# SQS queue
aws sqs get-queue-attributes \
    --queue-url <queue-url> \
    --attribute-names All \
    --profile bio-rad-dev
```

## 🚨 Rollback Procedure

If deployment fails or issues are detected:

### 1. Quick Rollback
```bash
# Revert to previous version
aws cloudformation cancel-update-stack \
    --stack-name order-vision-tracking-dev \
    --profile bio-rad-dev
```

### 2. Complete Rollback
```bash
# Delete the stack (if safe to do so)
aws cloudformation delete-stack \
    --stack-name order-vision-tracking-dev \
    --profile bio-rad-dev
```

### 3. Redeploy Previous Version
```bash
git checkout <previous-commit>
./deploy.sh dev
```

## 📊 Environment Configuration

### DEV Environment
- **Profile**: `bio-rad-dev`
- **Bucket**: `order-vision-ai-dev`
- **Stack**: `order-vision-tracking-dev`
- **Region**: `us-east-2`

### QA Environment  
- **Profile**: `bio-rad-qa`
- **Bucket**: `order-vision-ai-qa`
- **Stack**: `order-vision-tracking-qa`
- **Region**: `us-east-2`

### PROD Environment
- **Profile**: `bio-rad-prod`
- **Bucket**: `order-vision-ai-prod`
- **Stack**: `order-vision-tracking-prod`
- **Region**: `us-east-2`

## 🔧 Troubleshooting

### Common Issues

**1. Profile Not Found**
```bash
aws configure --profile bio-rad-dev
```

**2. Insufficient Permissions**
- Verify IAM permissions for CloudFormation, Lambda, DynamoDB, SQS
- Check with AWS administrator

**3. Stack Already Exists**
- Use `--no-confirm-changeset` flag (already in script)
- Or delete existing stack if safe

**4. Build Failures**
```bash
# Clean build
rm -rf .aws-sam
sam build --region us-east-2
```

### Getting Help
- Check CloudFormation events in AWS Console
- Review Lambda logs in CloudWatch
- Verify SQS queue messages
- Contact DevOps team for infrastructure issues

## 📝 Change Log

Keep track of deployments:
- Date: 
- Environment: DEV
- Changes: 
- Deployed by:
- Tested: ✅/❌
- Issues: None/Description

---

**Remember**: Always test in DEV first! 🧪
