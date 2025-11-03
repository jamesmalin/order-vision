```bash
rm order-vision-start-processing.zip
rm -rf node_modules
npm ci --only=production
zip -r9 order-vision-start-processing.zip node_modules .env index.mjs tracking-utils.mjs invoke-auth.mjs anthropic.mjs extract-materials.mjs format-dates.mjs translate.mjs search.mjs search-material.mjs search-accountmanager.mjs search-customer.mjs knvp-check.mjs quote-number.mjs rrc-number.mjs knvp.json states.json credentials-documentai.json
```

# DEV
## Create function
```bash
aws lambda create-function \
    --runtime nodejs22.x \
    --function-name order-vision-start-processing \
    --handler index.handler \
    --zip-file fileb://order-vision-start-processing.zip \
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
    --function-name order-vision-start-processing \
    --zip-file fileb://order-vision-start-processing.zip \
    --profile bio-rad-dev
```

```bash
aws lambda get-function-configuration \
    --region us-east-2 \
    --function-name order-vision-start-processing \
    --profile bio-rad-dev
```

"OPENAI_API_KEY": "",
```bash
aws lambda update-function-configuration \
    --region us-east-2 \
    --function-name order-vision-start-processing \
    --environment "Variables={\
PINECONE_ENVIRONMENT=DEV,\
BUCKET_NAME=order-vision-ai-dev,\
NAMESPACE=address_v7_prod_adrc,\
SAP_ENV=dev,\
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
    --function-name order-vision-start-processing \
    --handler index.handler \
    --zip-file fileb://order-vision-start-processing.zip \
    --role arn:aws:iam::367995044692:role/service-role/order-vision-upload-role-1eyc60zh \
    --timeout 300 \
    --memory-size 1024 \
    --environment "Variables={\
BUCKET_NAME=order-vision-ai-qa, \
PINECONE_ENVIRONMENT=DEV,\
NAMESPACE=address_v7_prod_adrc,\
AZURE=true,\
SAP_ENV=qa,\
VARIATION=CF-o3-mini-hi-ADDR-o3-mini-hi,\
CUSTOM_FIELDS_MODEL=o3-mini-test-2,\
ADDRESS_MODEL=o3-mini-test,\
AWS_LAMBDA_REGION=us-east-2,\
AZURE_INVOICE_PARSER_ENDPOINT=https://invoicew2-dev.cognitiveservices.azure.com/,\
AWS=true}" \
    --profile bio-rad-qa
```

## Update function
QA
```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name order-vision-start-processing \
    --zip-file fileb://order-vision-start-processing.zip \
    --profile bio-rad-qa
```

```bash
aws lambda get-function-configuration \
    --region us-east-2 \
    --function-name order-vision-start-processing \
    --profile bio-rad-qa
```

```bash
aws lambda update-function-configuration \
    --region us-east-2 \
    --function-name order-vision-start-processing \
    --environment "Variables={\
PINECONE_ENVIRONMENT=DEV,\
BUCKET_NAME=order-vision-ai-qa,\
NAMESPACE=address_v7_prod_adrc,\
SAP_ENV=qa,\
AZURE=true,\
VARIATION=CF-o3-mini-hi-ADDR-o3-mini-hi,\
CUSTOM_FIELDS_MODEL=o3-mini-test-2,\
ADDRESS_MODEL=o3-mini-test,\
AWS_LAMBDA_REGION=us-east-2,\
AZURE_INVOICE_PARSER_ENDPOINT=https://invoicew2-dev.cognitiveservices.azure.com/,\
AWS=true}" \
    --profile bio-rad-qa
```

# PROD
## Create function
```bash
aws lambda create-function \
    --runtime nodejs22.x \
    --function-name order-vision-start-processing \
    --handler index.handler \
    --zip-file fileb://order-vision-start-processing.zip \
    --role arn:aws:iam::954366782091:role/order-vision-upload-role-1eyc60zh \
    --timeout 900 \
    --memory-size 1024 \
    --environment "Variables={\
BUCKET_NAME=order-vision-ai-prod, \
PINECONE_ENVIRONMENT=PROD,\
NAMESPACE=address_v8_prod_adrc,\
AZURE=true,\
SAP_ENV=prod,\
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
    --function-name order-vision-start-processing \
    --zip-file fileb://order-vision-start-processing.zip \
    --profile bio-rad-prod
```

```bash
aws lambda get-function-configuration \
    --region us-east-2 \
    --function-name order-vision-start-processing \
    --profile bio-rad-prod
```

```bash
aws lambda update-function-configuration \
    --region us-east-2 \
    --function-name order-vision-start-processing \
    --environment "Variables={\
PINECONE_ENVIRONMENT=PROD,\
BUCKET_NAME=order-vision-ai-prod,\
NAMESPACE=address_v8_prod_adrc,\
SAP_ENV=prod,\
AZURE=true,\
VARIATION=CF-o3-mini-hi-ADDR-o3-mini-hi,\
CUSTOM_FIELDS_MODEL=o3-mini-2,\
ADDRESS_MODEL=o3-mini,\
AWS_LAMBDA_REGION=us-east-2,\
AZURE_INVOICE_PARSER_ENDPOINT=https://order-vision.cognitiveservices.azure.com/,\
AWS=true}" \
    --profile bio-rad-prod
```