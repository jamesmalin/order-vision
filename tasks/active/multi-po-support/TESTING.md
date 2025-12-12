# Multi-PO Support - End-to-End Testing Guide

## Overview
This guide provides step-by-step instructions for testing the multi-PO support feature using the upload API Gateway endpoint, which simulates the real-world flow.

## Prerequisites

- [ ] Both lambdas deployed to dev environment
- [ ] `MAX_CONCURRENT_POS=2` environment variable set on classification lambda
- [ ] AWS credentials configured with `bio-rad-dev` profile
- [ ] Authorization token available in `.env` file
- [ ] Test PDF files available (2+ PO files)

## Test Setup

### 1. Prepare Test Files

You'll need at least 2 PDF files that are Purchase Orders. Place them in a test directory:

```bash
# Example structure
test-files/
├── PO-12345.pdf
├── PO-67890.pdf
└── MailPdf_inquiry.pdf (optional - for RRC testing)
```

### 2. Create Test Payload

Create `lambda/upload/test-multi-po.json`:

```json
{
  "CreatedOn": "2025-11-05T14:00:00.000Z",
  "EmailId": "test-multi-po-001@example.com",
  "Subject": "Multiple Purchase Orders - Test",
  "From": "customer@example.com",
  "To": ["orders@bio-rad.com"],
  "Cc": [],
  "Body": "Please process these purchase orders. RRC: 3000215379",
  "Attachments": [
    {
      "AttachmentName": "PO-12345.pdf"
    },
    {
      "AttachmentName": "PO-67890.pdf"
    },
    {
      "AttachmentName": "MailPdf_inquiry.pdf"
    }
  ]
}
```

## End-to-End Test Procedure

### Step 1: Upload Request (Get Presigned URLs)

```bash
cd lambda/upload

# Get authorization token from .env
AUTHORIZATION_TOKEN=$(grep ^AUTHORIZATION_DEV= ../../.env | cut -d '=' -f2-)

# Call upload API to get presigned URLs
curl --request POST \
  -H "Authorization: $AUTHORIZATION_TOKEN" \
  -H "Content-Type: application/json" \
  --data "@test-multi-po.json" \
  https://b0jziam8t1.execute-api.us-east-2.amazonaws.com/dev/order-vision/upload \
  > API-response.json

# View the response
cat API-response.json | jq '.'
```

**Expected Response:**
```json
{
  "statusCode": 200,
  "body": [
    {
      "FileName": "PO-12345.pdf",
      "Url": "https://order-vision-ai-dev.s3.amazonaws.com/...",
      "FileKey": "uploads/1730822400000/PO-12345.pdf"
    },
    {
      "FileName": "PO-67890.pdf",
      "Url": "https://order-vision-ai-dev.s3.amazonaws.com/...",
      "FileKey": "uploads/1730822400000/PO-67890.pdf"
    },
    {
      "FileName": "MailPdf_inquiry.pdf",
      "Url": "https://order-vision-ai-dev.s3.amazonaws.com/...",
      "FileKey": "uploads/1730822400000/MailPdf_inquiry.pdf"
    }
  ]
}
```

### Step 2: Upload PDF Files to S3

Extract the presigned URLs and upload each file:

```bash
# Extract URLs using jq
URL_PO1=$(cat API-response.json | jq -r '.body[0].Url')
URL_PO2=$(cat API-response.json | jq -r '.body[1].Url')
URL_MAIL=$(cat API-response.json | jq -r '.body[2].Url')

# Upload files
curl --request PUT \
  --upload-file "../../test-files/PO-12345.pdf" \
  --header "Content-Type: application/octet-stream" \
  "$URL_PO1"

curl --request PUT \
  --upload-file "../../test-files/PO-67890.pdf" \
  --header "Content-Type: application/octet-stream" \
  "$URL_PO2"

curl --request PUT \
  --upload-file "../../test-files/MailPdf_inquiry.pdf" \
  --header "Content-Type: application/octet-stream" \
  "$URL_MAIL"
```

### Step 3: Monitor Processing

The upload-check lambda runs every minute via EventBridge. Once all files are uploaded, it will trigger the classification lambda.

```bash
# Monitor upload-check lambda
aws logs tail /aws/lambda/order-vision-upload-check --follow --profile bio-rad-dev

# Monitor classification lambda (in separate terminal)
aws logs tail /aws/lambda/order-vision-classification --follow --profile bio-rad-dev

# Monitor start-processing lambda (in separate terminal)
aws logs tail /aws/lambda/order-vision-start-processing --follow --profile bio-rad-dev
```

### Step 4: Verify Results

#### Check S3 Files

```bash
# Get timestamp from API response
TIMESTAMP=$(cat API-response.json | jq -r '.body[0].FileKey' | cut -d'/' -f2)

# List all files in the upload directory
aws s3 ls s3://order-vision-ai-dev/uploads/$TIMESTAMP/ --profile bio-rad-dev

# Expected files:
# - PO-12345.pdf
# - PO-67890.pdf
# - MailPdf_inquiry.pdf
# - metadata.json
# - classification.json
# - processed-PO_12345_pdf.json
# - processed-PO_67890_pdf.json
```

#### Download and Inspect Processed Files

```bash
# Download classification.json
aws s3 cp s3://order-vision-ai-dev/uploads/$TIMESTAMP/classification.json . --profile bio-rad-dev

# Download processed files
aws s3 cp s3://order-vision-ai-dev/uploads/$TIMESTAMP/processed-PO_12345_pdf.json . --profile bio-rad-dev
aws s3 cp s3://order-vision-ai-dev/uploads/$TIMESTAMP/processed-PO_67890_pdf.json . --profile bio-rad-dev

# Inspect classification
cat classification.json | jq '.metadata.Attachments[] | {AttachmentName, Type}'

# Verify both processed files exist and contain data
ls -lh processed-*.json
```

#### Check Tracking Events

```bash
# Query tracking table for this timestamp
aws dynamodb query \
  --table-name order-vision-tracking-dev \
  --key-condition-expression "timestamp = :ts" \
  --expression-attribute-values '{":ts":{"N":"'$TIMESTAMP'"}}' \
  --profile bio-rad-dev
```

**Expected Events:**
- upload_started
- upload_completed
- upload_check_started
- upload_check_completed
- classification_started
- classification_completed
- processing_started (2x - one per PO)
- processing_completed (2x - one per PO)
- sap_delivery_completed (2x - one per PO)

## Test Scenarios

### Scenario 1: Two POs with RRC Numbers ✅

**Setup:**
- 2 Purchase Order PDFs
- 1 Customer Inquiry with RRC numbers
- 1 Supporting Document (optional)

**Expected Results:**
- ✅ Both POs classified correctly
- ✅ RRC numbers extracted from customer inquiry
- ✅ Both POs invoked in single batch (MAX_CONCURRENT_POS=2)
- ✅ Two processed files created: `processed-PO1.json`, `processed-PO2.json`
- ✅ Both POs contain RRC numbers
- ✅ Both POs sent to SAP
- ✅ Proper tracking events for each PO

**Validation:**
```bash
# Check classification logs for batch processing
aws logs filter-log-events \
  --log-group-name /aws/lambda/order-vision-classification \
  --filter-pattern "Found 2 Purchase Order" \
  --profile bio-rad-dev

# Check for batch processing log
aws logs filter-log-events \
  --log-group-name /aws/lambda/order-vision-classification \
  --filter-pattern "Processing batch 1" \
  --profile bio-rad-dev

# Verify both POs received RRC numbers
cat processed-PO_12345_pdf.json | jq '.RRC.value'
cat processed-PO_67890_pdf.json | jq '.RRC.value'
```

### Scenario 2: Single PO (Backward Compatibility) ✅

**Setup:**
- 1 Purchase Order PDF only

**Expected Results:**
- ✅ Single PO classified correctly
- ✅ Processed as before (backward compatibility mode)
- ✅ Single processed file: `processed-PO.json`
- ✅ Sent to SAP
- ✅ No batch processing logs (only 1 PO)

**Validation:**
```bash
# Check for backward compatibility log
aws logs filter-log-events \
  --log-group-name /aws/lambda/order-vision-start-processing \
  --filter-pattern "Processing first PO found (backward compatibility mode)" \
  --profile bio-rad-dev
```

### Scenario 3: Three POs (Multiple Batches) ✅

**Setup:**
- 3 Purchase Order PDFs

**Expected Results:**
- ✅ All 3 POs classified correctly
- ✅ Batch 1: 2 POs invoked
- ✅ 2-second delay
- ✅ Batch 2: 1 PO invoked
- ✅ Three processed files created
- ✅ All 3 POs sent to SAP

**Validation:**
```bash
# Check for multiple batch logs
aws logs filter-log-events \
  --log-group-name /aws/lambda/order-vision-classification \
  --filter-pattern "Processing batch" \
  --profile bio-rad-dev

# Should see:
# - "Processing batch 1: [PO1, PO2]"
# - "Waiting 2 seconds before next batch..."
# - "Processing batch 2: [PO3]"
```

### Scenario 4: Five POs (Maximum Batches) ✅

**Setup:**
- 5 Purchase Order PDFs

**Expected Results:**
- ✅ All 5 POs classified correctly
- ✅ Batch 1: 2 POs → delay → Batch 2: 2 POs → delay → Batch 3: 1 PO
- ✅ Five processed files created
- ✅ All 5 POs sent to SAP
- ✅ No API rate limit errors

### Scenario 5: Error Handling ⚠️

**Setup:**
- 2 Purchase Order PDFs
- Temporarily disable one Lambda or cause an error

**Expected Results:**
- ✅ One PO processes successfully
- ✅ One PO fails with proper error
- ✅ Alert generated for failed PO
- ✅ Successful PO still completes and sends to SAP
- ✅ Metrics logged: "1 successful, 1 failed out of 2 total"

## Monitoring During Tests

### Real-Time Log Monitoring

Open 3 terminal windows:

**Terminal 1 - Classification:**
```bash
aws logs tail /aws/lambda/order-vision-classification \
  --follow \
  --format short \
  --profile bio-rad-dev
```

**Terminal 2 - Start-Processing:**
```bash
aws logs tail /aws/lambda/order-vision-start-processing \
  --follow \
  --format short \
  --profile bio-rad-dev
```

**Terminal 3 - Upload-Check:**
```bash
aws logs tail /aws/lambda/order-vision-upload-check \
  --follow \
  --format short \
  --profile bio-rad-dev
```

### Key Log Messages to Watch For

#### Classification Lambda:
- ✅ `Found X Purchase Order(s) - processing with max concurrency of 2`
- ✅ `Processing batch 1: [PO1, PO2]`
- ✅ `Waiting 2 seconds before next batch...` (if >2 POs)
- ✅ `Async invoke succeeded for PO-12345.pdf on attempt 1`
- ✅ `PO processing invocations: 2 successful, 0 failed out of 2 total`

#### Start-Processing Lambda:
- ✅ `Processing specific PO: PO-12345.pdf`
- ✅ `Writing processed file: uploads/TIMESTAMP/processed-PO_12345_pdf.json`
- ✅ `Created processed.json file in /uploads/TIMESTAMP/`

## Performance Benchmarks

### Expected Timings (Approximate)

| Scenario | Classification | Start-Processing (per PO) | Total Time |
|----------|---------------|---------------------------|------------|
| 1 PO | ~30s | ~120s | ~150s |
| 2 POs | ~30s | ~120s (parallel) | ~150s |
| 3 POs | ~30s | ~120s + 2s delay + ~120s | ~272s |
| 5 POs | ~30s | ~120s + 2s + ~120s + 2s + ~120s | ~394s |

**Note**: Start-processing times are parallel within batches, so 2 POs in a batch take ~120s total, not 240s.

## Troubleshooting Test Issues

### Issue: Files Not Uploading
```bash
# Check if presigned URLs are valid
echo $URL_PO1

# Verify file exists
ls -lh ../../test-files/PO-12345.pdf

# Try manual upload with verbose output
curl -v --request PUT \
  --upload-file "../../test-files/PO-12345.pdf" \
  --header "Content-Type: application/octet-stream" \
  "$URL_PO1"
```

### Issue: Upload-Check Not Triggering
```bash
# Check EventBridge rule
aws events list-rules --profile bio-rad-dev | grep upload-check

# Manually trigger upload-check
aws lambda invoke \
  --function-name order-vision-upload-check \
  --region us-east-2 \
  --profile bio-rad-dev \
  response.json
```

### Issue: Classification Not Finding POs
```bash
# Download and inspect classification.json
aws s3 cp s3://order-vision-ai-dev/uploads/$TIMESTAMP/classification.json . --profile bio-rad-dev

# Check attachment types
cat classification.json | jq '.metadata.Attachments[] | {AttachmentName, Type}'
```

### Issue: Start-Processing Not Invoked
```bash
# Check classification logs for invocation errors
aws logs filter-log-events \
  --log-group-name /aws/lambda/order-vision-classification \
  --filter-pattern "Async invoke" \
  --profile bio-rad-dev

# Check for error messages
aws logs filter-log-events \
  --log-group-name /aws/lambda/order-vision-classification \
  --filter-pattern "ERROR" \
  --profile bio-rad-dev
```

## Test Checklist

### Pre-Test
- [ ] Lambdas deployed
- [ ] Environment variables set
- [ ] Test files prepared
- [ ] Test payload created
- [ ] Authorization token available

### During Test
- [ ] Upload request successful (got presigned URLs)
- [ ] All files uploaded successfully
- [ ] Upload-check triggered (wait up to 1 minute)
- [ ] Classification started
- [ ] All POs classified correctly
- [ ] Batch processing logs visible
- [ ] Start-processing invoked for each PO
- [ ] Each PO processed independently

### Post-Test
- [ ] All processed files created in S3
- [ ] Each processed file has unique name
- [ ] RRC numbers present in all POs (if applicable)
- [ ] All POs sent to SAP
- [ ] Tracking events recorded
- [ ] No errors in CloudWatch logs
- [ ] No alerts generated (unless testing error scenarios)

## Success Criteria

### Functional Success
- ✅ All PO attachments identified and classified
- ✅ Each PO invoked for processing
- ✅ Unique processed files created for each PO
- ✅ RRC numbers shared across all POs
- ✅ Each PO sent to SAP independently

### Performance Success
- ✅ Batch processing completes within expected time
- ✅ No API rate limit errors
- ✅ Processing time scales linearly with PO count
- ✅ No Lambda timeouts

### Operational Success
- ✅ Proper tracking events for each PO
- ✅ Clear logs showing batch processing
- ✅ Alerts only for actual failures
- ✅ S3 files organized correctly

## Quick Test Script

Create `test-multi-po.sh` for automated testing:

```bash
#!/bin/bash

# Configuration
TIMESTAMP=$(date +%s)000
TEST_DIR="../../test-files"
UPLOAD_DIR="lambda/upload"

echo "=== Multi-PO Test Script ==="
echo "Timestamp: $TIMESTAMP"

# Step 1: Create test payload
cat > $UPLOAD_DIR/test-multi-po.json <<EOF
{
  "CreatedOn": "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)",
  "EmailId": "test-multi-po-$TIMESTAMP@example.com",
  "Subject": "Multi-PO Test - $TIMESTAMP",
  "From": "test@example.com",
  "To": ["orders@bio-rad.com"],
  "Cc": [],
  "Body": "Test multi-PO processing",
  "Attachments": [
    {"AttachmentName": "PO-12345.pdf"},
    {"AttachmentName": "PO-67890.pdf"}
  ]
}
EOF

# Step 2: Get presigned URLs
echo "Getting presigned URLs..."
cd $UPLOAD_DIR
AUTHORIZATION_TOKEN=$(grep ^AUTHORIZATION_DEV= ../../.env | cut -d '=' -f2-)
curl --request POST \
  -H "Authorization: $AUTHORIZATION_TOKEN" \
  -H "Content-Type: application/json" \
  --data "@test-multi-po.json" \
  https://b0jziam8t1.execute-api.us-east-2.amazonaws.com/dev/order-vision/upload \
  > API-response.json

# Step 3: Upload files
echo "Uploading files..."
URL_PO1=$(cat API-response.json | jq -r '.body[0].Url')
URL_PO2=$(cat API-response.json | jq -r '.body[1].Url')

curl --request PUT --upload-file "$TEST_DIR/PO-12345.pdf" "$URL_PO1"
curl --request PUT --upload-file "$TEST_DIR/PO-67890.pdf" "$URL_PO2"

echo "Files uploaded! Monitoring will begin in 60 seconds (upload-check schedule)..."
echo "Watch logs with: aws logs tail /aws/lambda/order-vision-classification --follow --profile bio-rad-dev"
```

## Test Results Template

Document your test results:

```markdown
## Test Results - [Date]

### Test Scenario: [Scenario Name]
**Tester**: [Name]
**Environment**: DEV
**Timestamp**: [Timestamp]

### Results
- [ ] All POs classified correctly
- [ ] Batch processing worked as expected
- [ ] Unique files created for each PO
- [ ] RRC numbers shared correctly
- [ ] All POs sent to SAP
- [ ] No errors in logs

### Observations
- [Any notable observations]

### Issues Found
- [Any issues encountered]

### Performance
- Classification time: [X seconds]
- Processing time per PO: [X seconds]
- Total time: [X seconds]
```

## Next Steps After Testing

1. **If tests pass**: Proceed to QA deployment
2. **If issues found**: Document in task README, fix, and re-test
3. **Performance tuning**: Adjust `MAX_CONCURRENT_POS` if needed
4. **Documentation**: Update with any learnings from testing
