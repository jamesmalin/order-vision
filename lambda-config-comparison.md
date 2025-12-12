# Lambda Configuration Comparison Report
## Dev vs QA Environment Variables

Generated: 2025-11-23

---

## 1. order-vision-upload

### DEV Environment
```json
{
  "TRACKING_QUEUE_URL": "https://sqs.us-east-2.amazonaws.com/614250372661/order-vision-tracking-queue-dev",
  "BUCKET_NAME": "order-vision-ai-dev"
}
```

### QA Environment
```json
{
  "BUCKET_NAME": "order-vision-ai-qa"
}
```

### ⚠️ MISSING in QA:
- **TRACKING_QUEUE_URL** - Should be set to QA tracking queue URL

---

## 2. order-vision-upload-check

### DEV Environment
```json
{
  "TRACKING_QUEUE_URL": "https://sqs.us-east-2.amazonaws.com/614250372661/order-vision-tracking-queue-dev",
  "BUCKET_NAME": "order-vision-ai-dev",
  "REGION": "us-east-2"
}
```

### QA Environment
```json
{
  "BUCKET_NAME": "order-vision-ai-qa"
}
```

### ⚠️ MISSING in QA:
- **TRACKING_QUEUE_URL** - Should be set to QA tracking queue URL
- **REGION** - Should be "us-east-2"

---

## 3. order-vision-classification

### DEV Environment
```json
{
  "NAMESPACE": "address_v7_prod_adrc",
  "AZURE": "true",
  "VARIATION": "CF-o3-mini-hi-ADDR-o3-mini-hi",
  "TRACKING_QUEUE_URL": "https://sqs.us-east-2.amazonaws.com/614250372661/order-vision-tracking-queue-dev",
  "AWS_LAMBDA_REGION": "us-east-2",
  "AZURE_INVOICE_PARSER_ENDPOINT": "https://invoicew2-dev.cognitiveservices.azure.com/",
  "PINECONE_ENVIRONMENT": "DEV",
  "MAX_CONCURRENT_POS": "2",
  "AWS": "true",
  "CUSTOM_FIELDS_MODEL": "o3-mini-test-2",
  "BUCKET_NAME": "order-vision-ai-dev",
  "ADDRESS_MODEL": "o3-mini-test"
}
```

### QA Environment
```json
{
  "NAMESPACE": "address_v7_prod_adrc",
  "AZURE": "true",
  "VARIATION": "CF-o3-mini-hi-ADDR-o3-mini-hi",
  "AWS_LAMBDA_REGION": "us-east-2",
  "AZURE_INVOICE_PARSER_ENDPOINT": "https://invoicew2-dev.cognitiveservices.azure.com/",
  "PINECONE_ENVIRONMENT": "DEV",
  "AWS": "true",
  "CUSTOM_FIELDS_MODEL": "o3-mini-test-2",
  "BUCKET_NAME": "order-vision-ai-qa",
  "ADDRESS_MODEL": "o3-mini-test"
}
```

### ⚠️ MISSING in QA:
- **TRACKING_QUEUE_URL** - Should be set to QA tracking queue URL
- **MAX_CONCURRENT_POS** - Should be "2"

---

## 4. order-vision-start-processing

### DEV Environment
```json
{
  "NAMESPACE": "address_v8_prod_adrc",
  "AZURE": "true",
  "SAP_ENV": "dev",
  "VARIATION": "CF-o3-mini-hi-ADDR-o3-mini-hi",
  "TRACKING_QUEUE_URL": "https://sqs.us-east-2.amazonaws.com/614250372661/order-vision-tracking-queue-dev",
  "AWS_LAMBDA_REGION": "us-east-2",
  "AZURE_INVOICE_PARSER_ENDPOINT": "https://invoicew2-dev.cognitiveservices.azure.com/",
  "PINECONE_ENVIRONMENT": "DEV",
  "AWS": "true",
  "CUSTOM_FIELDS_MODEL": "o3-mini-test-2",
  "BUCKET_NAME": "order-vision-ai-dev",
  "ADDRESS_MODEL": "o3-mini-test"
}
```

### QA Environment
```json
{
  "NAMESPACE": "address_v7_prod_adrc",
  "AZURE": "true",
  "SAP_ENV": "qa",
  "VARIATION": "CF-o3-mini-hi-ADDR-o3-mini-hi",
  "AWS_LAMBDA_REGION": "us-east-2",
  "AZURE_INVOICE_PARSER_ENDPOINT": "https://invoicew2-dev.cognitiveservices.azure.com/",
  "PINECONE_ENVIRONMENT": "DEV",
  "AWS": "true",
  "CUSTOM_FIELDS_MODEL": "o3-mini-test-2",
  "BUCKET_NAME": "order-vision-ai-qa",
  "ADDRESS_MODEL": "o3-mini-test"
}
```

### ⚠️ MISSING in QA:
- **TRACKING_QUEUE_URL** - Should be set to QA tracking queue URL

### ⚠️ DIFFERENCE:
- **NAMESPACE**: DEV uses "address_v8_prod_adrc", QA uses "address_v7_prod_adrc"

---

## PROD Environment Check

### order-vision-classification (PROD)
- **NAMESPACE**: `address_v8_prod_adrc` ✅

### order-vision-start-processing (PROD)
- **NAMESPACE**: `address_v8_prod_adrc` ✅

**Note**: PROD uses v8 namespace, matching DEV. QA is using the older v7 namespace.

---

## Summary of Issues

### Critical Missing Variables in QA:

1. **order-vision-upload (QA)**
   - Missing: TRACKING_QUEUE_URL

2. **order-vision-upload-check (QA)**
   - Missing: TRACKING_QUEUE_URL
   - Missing: REGION

3. **order-vision-classification (QA)**
   - Missing: TRACKING_QUEUE_URL
   - Missing: MAX_CONCURRENT_POS

4. **order-vision-start-processing (QA)**
   - Missing: TRACKING_QUEUE_URL

### Configuration Differences:

1. **NAMESPACE Status** (Updated 2025-11-23):
   - **PROD** classification: `address_v8_prod_adrc` ✅
   - **PROD** start-processing: `address_v8_prod_adrc` ✅
   - **DEV** classification: `address_v8_prod_adrc` ✅
   - **DEV** start-processing: `address_v8_prod_adrc` ✅
   - **QA** classification: `address_v8_prod_adrc` ✅ **UPDATED**
   - **QA** start-processing: `address_v8_prod_adrc` ✅ **UPDATED**

### Recommendations:

1. **Add TRACKING_QUEUE_URL to all QA functions** - This is critical for tracking functionality
2. **Add REGION to order-vision-upload-check (QA)** - Set to "us-east-2"
3. **Add MAX_CONCURRENT_POS to order-vision-classification (QA)** - Set to "2"
4. **Update NAMESPACE to v8 in DEV classification** - PROD uses `address_v8_prod_adrc`:
   - ✅ QA classification: **COMPLETED** - Updated to v8
   - ✅ QA start-processing: **COMPLETED** - Updated to v8
   - ⚠️ DEV classification: Still needs update from v7 to v8

### Notes:
- All functions correctly use environment-specific BUCKET_NAME values
- SAP_ENV is correctly set (dev/qa) where applicable
- All other configuration values match between environments
