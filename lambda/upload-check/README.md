# Dependencies
```bash
npm install @aws-sdk/client-s3 @aws-sdk/client-lambda
```

# Zip
```bash
zip -r9 order-vision-upload-check.zip index.mjs tracking-utils.mjs node_modules
```

# DEV

## Create function
```bash
aws lambda create-function \
    --runtime nodejs22.x \
    --function-name order-vision-upload-check \
    --handler index.handler \
    --zip-file fileb://order-vision-upload-check.zip \
    --role arn:aws:iam::614250372661:role/service-role/order-vision-upload-role-hv9lejlk \
    --timeout 60 \
    --environment Variables="{ \
      BUCKET_NAME=order-vision-ai-dev, \
    }" \
    --profile bio-rad-dev
```

## Update function
```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name order-vision-upload-check \
    --zip-file fileb://order-vision-upload-check.zip \
    --profile bio-rad-dev
```

## Check Config
```bash
aws lambda get-function-configuration \
    --region us-east-2 \
    --function-name order-vision-upload-check \
    --profile bio-rad-dev
```

```bash
aws lambda update-function-configuration \
    --region us-east-2 \
    --function-name order-vision-upload \
    --environment "Variables={\
BUCKET_NAME=order-vision-ai-dev,\
TRACKING_QUEUE_URL=https://sqs.us-east-2.amazonaws.com/614250372661/order-vision-tracking-queue-dev,\
}" \
    --profile bio-rad-dev
```

## Invoke
```bash
aws lambda invoke \
  --function-name order-vision-upload-check \
  --profile bio-rad-dev \
  response.json
  ```

```bash
aws logs get-log-events \
  --log-group-name /aws/lambda/order-vision-upload-check \
  --log-stream-name $(aws logs describe-log-streams \
    --log-group-name /aws/lambda/order-vision-upload-check \
    --order-by LastEventTime \
    --descending \
    --max-items 1 \
    --query 'logStreams[0].logStreamName' \
    --output text \
    --profile bio-rad-dev) \
  --profile bio-rad-dev
```

# QA

## Create function
```bash
aws lambda create-function \
    --runtime nodejs22.x \
    --function-name order-vision-upload-check \
    --handler index.handler \
    --zip-file fileb://order-vision-upload-check.zip \
    --role arn:aws:iam::367995044692:role/service-role/order-vision-upload-role-1eyc60zh \
    --timeout 60 \
    --environment Variables="{ \
      BUCKET_NAME=order-vision-ai-qa, \
    }" \
    --profile bio-rad-qa
```

## Update function
```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name order-vision-upload-check \
    --zip-file fileb://order-vision-upload-check.zip \
    --profile bio-rad-qa
```

## Check Config
```bash
aws lambda get-function-configuration \
    --region us-east-2 \
    --function-name order-vision-upload-check \
    --profile bio-rad-qa
```

# PROD

## Create function
```bash
aws lambda create-function \
    --runtime nodejs22.x \
    --function-name order-vision-upload-check \
    --handler index.handler \
    --zip-file fileb://order-vision-upload-check.zip \
    --role arn:aws:iam::954366782091:role/order-vision-upload-role-1eyc60zh \
    --timeout 60 \
    --environment Variables="{ \
      BUCKET_NAME=order-vision-ai-prod, \
    }" \
    --profile bio-rad-prod
```

## Update function
```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name order-vision-upload-check \
    --zip-file fileb://order-vision-upload-check.zip \
    --profile bio-rad-prod
```

## Check Config
```bash
aws lambda get-function-configuration \
    --region us-east-2 \
    --function-name order-vision-upload-check \
    --profile bio-rad-prod
```