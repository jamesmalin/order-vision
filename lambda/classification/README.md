```bash
rm order-vision-classification.zip
rm -rf node_modules
npm ci --only=production
zip -r order-vision-classification.zip node_modules .env index.mjs tracking-utils.mjs rrc-number.mjs credentials-documentai.json
```

# DEV
## Create function
```bash
aws lambda create-function \
    --runtime nodejs22.x \
    --function-name order-vision-classification \
    --handler index.handler \
    --zip-file fileb://order-vision-classification.zip \
    --role arn:aws:iam::614250372661:role/service-role/order-vision-upload-role-hv9lejlk \
    --timeout 300 \
    --memory-size 1024 \
    --environment "Variables={\
BUCKET_NAME=order-vision-ai-dev, \
PINECONE_ENVIRONMENT=DEV,\
NAMESPACE=address_v7_prod_adrc,\
AZURE=true,\
VARIATION=CF-o3-mini-hi-ADDR-o3-mini-hi,\
CUSTOM_FIELDS_MODEL=o3-mini-test-2,\
ADDRESS_MODEL=o3-mini-test,\
AWS_LAMBDA_REGION=us-east-2,\
AZURE_INVOICE_PARSER_ENDPOINT=https://invoicew2-dev.cognitiveservices.azure.com/,\
AWS=true}" \
    --profile bio-rad-dev
```

## Update function
DEV
```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name order-vision-classification \
    --zip-file fileb://order-vision-classification.zip \
    --profile bio-rad-dev
```

```bash
aws lambda get-function-configuration \
    --region us-east-2 \
    --function-name order-vision-classification \
    --profile bio-rad-dev
```

"OPENAI_API_KEY": "",
```bash
aws lambda update-function-configuration \
    --region us-east-2 \
    --function-name order-vision-classification \
    --environment "Variables={\
PINECONE_ENVIRONMENT=DEV,\
NAMESPACE=address_v7_prod_adrc,\
AZURE=true,\
VARIATION=CF-o3-mini-hi-ADDR-o3-mini-hi,\
CUSTOM_FIELDS_MODEL=o3-mini-test-2,\
ADDRESS_MODEL=o3-mini-test,\
AWS_LAMBDA_REGION=us-east-2,\
AZURE_INVOICE_PARSER_ENDPOINT=https://invoicew2-dev.cognitiveservices.azure.com/,\
TRACKING_QUEUE_URL=https://sqs.us-east-2.amazonaws.com/614250372661/order-vision-tracking-queue-dev,\
AWS=true}" \
    --profile bio-rad-dev
```

# QA
## Create function
```bash
aws lambda create-function \
    --runtime nodejs22.x \
    --function-name order-vision-classification \
    --handler index.handler \
    --zip-file fileb://order-vision-classification.zip \
    --role arn:aws:iam::367995044692:role/service-role/order-vision-upload-role-1eyc60zh \
    --timeout 300 \
    --memory-size 1024 \
    --environment "Variables={\
BUCKET_NAME=order-vision-ai-qa, \
PINECONE_ENVIRONMENT=DEV,\
NAMESPACE=address_v7_prod_adrc,\
AZURE=true,\
VARIATION=CF-o3-mini-hi-ADDR-o3-mini-hi,\
CUSTOM_FIELDS_MODEL=o3-mini-test-2,\
ADDRESS_MODEL=o3-mini-test,\
AWS_LAMBDA_REGION=us-east-2,\
AZURE_INVOICE_PARSER_ENDPOINT=https://invoicew2-dev.cognitiveservices.azure.com/,\
AWS=true}" \
    --profile bio-rad-qa
```

## Update function
```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name order-vision-classification \
    --zip-file fileb://order-vision-classification.zip \
    --profile bio-rad-qa
```

```bash
aws lambda get-function-configuration \
    --region us-east-2 \
    --function-name order-vision-classification \
    --profile bio-rad-qa
```

# PROD
## Create function
```bash
aws lambda create-function \
    --runtime nodejs22.x \
    --function-name order-vision-classification \
    --handler index.handler \
    --zip-file fileb://order-vision-classification.zip \
    --role arn:aws:iam::954366782091:role/order-vision-upload-role-1eyc60zh \
    --timeout 300 \
    --memory-size 1024 \
    --environment "Variables={\
BUCKET_NAME=order-vision-ai-prod, \
PINECONE_ENVIRONMENT=PROD,\
NAMESPACE=address_v8_prod_adrc,\
AZURE=true,\
VARIATION=CF-o3-mini-hi-ADDR-o3-mini-hi,\
CUSTOM_FIELDS_MODEL=o3-mini-2,\
ADDRESS_MODEL=o3-mini,\
AWS_LAMBDA_REGION=us-east-2,\
AZURE_INVOICE_PARSER_ENDPOINT=https://order-vision.cognitiveservices.azure.com/,\
AWS=true}" \
    --profile bio-rad-prod
```

## Update function
```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name order-vision-classification \
    --zip-file fileb://order-vision-classification.zip \
    --profile bio-rad-prod
```

```bash
aws lambda get-function-configuration \
    --region us-east-2 \
    --function-name order-vision-classification \
    --profile bio-rad-prod
```

```bash
aws lambda update-function-configuration \
    --region us-east-2 \
    --function-name order-vision-classification \
    --environment "Variables={\
BUCKET_NAME=order-vision-ai-prod, \
PINECONE_ENVIRONMENT=PROD,\
NAMESPACE=address_v8_prod_adrc,\
AZURE=true,\
VARIATION=CF-o3-mini-hi-ADDR-o3-mini-hi,\
CUSTOM_FIELDS_MODEL=o3-mini-2,\
ADDRESS_MODEL=o3-mini,\
AWS_LAMBDA_REGION=us-east-2,\
AZURE_INVOICE_PARSER_ENDPOINT=https://order-vision.cognitiveservices.azure.com/,\
AWS=true}" \
    --profile bio-rad-prod
```