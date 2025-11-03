# EventBridge Scheduler for Upload Check Lambda

This directory contains a CloudFormation template that creates an EventBridge Scheduler to run the `order-vision-upload-check` lambda function every 2 minutes.

## Components

The template creates:
- An IAM role for EventBridge Scheduler with permissions to invoke the lambda function
- A schedule that runs every 2 minutes with the lambda function as the target

## Deployment

If there was a previous failed deployment, wait for any rollback to complete before trying again.

### Option 1: Deploy with default role

To deploy the scheduler with the default role, run the following AWS CLI command:

```bash
aws cloudformation deploy \
  --template-file template.yml \
  --stack-name order-vision-upload-check-scheduler \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-2 \
  --profile bio-rad-dev
```

### Option 2: Deploy with custom role

To deploy the scheduler with a custom IAM role, use the `--parameter-overrides` option:

```bash
aws cloudformation deploy \
  --template-file template.yml \
  --stack-name order-vision-upload-check-scheduler \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-2 \
  --profile bio-rad-prod \
  --parameter-overrides RoleArn=arn:aws:iam::954366782091:role/order-vision-upload-role-1eyc60zh
```

### Parameters

The template accepts the following parameters:

- `RoleArn` (String): IAM Role ARN for the EventBridge Scheduler to assume
  - Default: `arn:aws:iam::614250372661:role/service-role/order-vision-upload-role-hv9lejlk`
  - Description: IAM Role ARN for the EventBridge Scheduler to assume

## Verification

To verify the deployment:

1. Check the stack status:
```bash
aws cloudformation describe-stacks \
  --stack-name order-vision-upload-check-scheduler \
  --region us-east-2 \
  --profile bio-rad-dev
```

2. View the created schedule in EventBridge Scheduler:
```bash
aws scheduler get-schedule \
  --name order-vision-upload-check-schedule \
  --region us-east-2 \
  --profile bio-rad-dev
```

## Cleanup

To remove the scheduler and associated resources:

```bash
aws cloudformation delete-stack \
  --stack-name order-vision-upload-check-scheduler \
  --region us-east-2 \
  --profile bio-rad-dev
```
