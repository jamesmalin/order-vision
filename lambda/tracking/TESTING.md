# Order Vision Tracking System - Testing Guide

This guide provides comprehensive testing procedures for the Order Vision tracking system. **All testing must be done in the dev environment only.**

## 🚨 Testing Policy

**IMPORTANT**: Always test in the **DEV environment only** during development.

- ✅ **DEV**: All testing and validation
- ❌ **QA/PROD**: Never test in higher environments during development

## 📋 Prerequisites

### 1. Deploy Tracking System
```bash
cd lambda/tracking
./deploy.sh dev
```

### 2. Get Tracking Queue URL
```bash
aws cloudformation describe-stacks \
    --stack-name order-vision-tracking-dev \
    --region us-east-2 \
    --profile bio-rad-dev \
    --query 'Stacks[0].Outputs[?OutputKey==`TrackingQueueUrl`].OutputValue' \
    --output text \
    --no-paginate
```

### 3. Verify Resources Created
```bash
# Check DynamoDB table
aws dynamodb describe-table \
    --table-name order-vision-tracking-dev \
    --profile bio-rad-dev \
    --region us-east-2 \
    --output json \
    --no-paginate

# Check SQS queue
aws sqs get-queue-attributes \
    --queue-url <tracking-queue-url> \
    --attribute-names All \
    --profile bio-rad-dev \
    --region us-east-2 \
    --output json \
    --no-paginate

# Check Lambda functions
aws lambda get-function \
    --function-name order-vision-tracking-dev \
    --profile bio-rad-dev \
    --region us-east-2 \
    --output json \
    --no-paginate

aws lambda get-function \
    --function-name order-vision-monitoring-dev \
    --profile bio-rad-dev \
    --region us-east-2 \
    --output json \
    --no-paginate
```

## 🧪 Unit Testing

### Test Tracking Lambda Directly
```bash
cd lambda/tracking

# Test upload event
sam local invoke TrackingFunction -e test-events/upload-event.json

# Test classification event
sam local invoke TrackingFunction -e test-events/classification-event.json

# Test monitoring lambda
sam local invoke MonitoringFunction -e test-events/monitoring-event.json
```

### Test Tracking Utilities
```bash
# Create a simple test script
cat > test-tracking-utils.mjs << 'EOF'
import { trackUploadStarted, trackUploadCompleted } from './tracking-utils.mjs';

const timestamp = Date.now();
const metadata = {
  "CreatedOn": "2025-10-08T06:23:20.0000000Z",
  "Subject": "Test Upload",
  "From": "test@bio-rad.com",
  "To": ["dev@bio-rad.com"],
  "Attachments": [{"AttachmentName": "test.pdf"}]
};

// Test tracking calls
await trackUploadStarted(timestamp, metadata, metadata.Attachments);
await trackUploadCompleted(timestamp, metadata, metadata.Attachments);

console.log('Tracking test completed');
EOF

# Run the test (requires TRACKING_QUEUE_URL env var)
TRACKING_QUEUE_URL=<your-queue-url> node test-tracking-utils.mjs
```

## 🔄 End-to-End Testing

### Step 1: Trigger Upload via API

Use test payload:
lambda/upload/test.json


Trigger upload:
```bash
curl --request POST -H "Authorization: EEEmoY9FshUl6j2Ec7mRTlP9t/h+p36T1fBptOM0aMQ=" -H "Content-Type: application/json" --data "@test.json" https://dev.git-api.bio-rad.com/order-vision/upload > API-response.json

# Check response
cat API-response.json
```

### Step 2: Upload Test Files

Extract URLs from response and upload files:
```bash
# Upload files using the pre-signed URLs
curl --request PUT \
  --upload-file "ABC.pdf" \
  --header "Content-Type: application/octet-stream" \
  "<presigned-url-1>"
```

### Step 3: Monitor Processing Pipeline

Wait for upload-check to trigger (runs every 2 minutes):
```bash
# Monitor upload-check lambda logs (recent entries)
aws logs filter-log-events \
    --log-group-name /aws/lambda/order-vision-upload-check \
    --start-time $(date -d '10 minutes ago' +%s)000 \
    --profile bio-rad-dev \
    --region us-east-2 \
    --output text \
    --no-paginate

# For real-time monitoring (optional - will follow logs)
aws logs tail /aws/lambda/order-vision-upload-check \
    --follow \
    --profile bio-rad-dev \
    --region us-east-2
```

Monitor classification lambda:
```bash
# Monitor classification lambda logs (recent entries)
aws logs filter-log-events \
    --log-group-name /aws/lambda/order-vision-classification \
    --start-time $(date -d '10 minutes ago' +%s)000 \
    --profile bio-rad-dev \
    --region us-east-2 \
    --output text \
    --no-paginate

# For real-time monitoring (optional - will follow logs)
aws logs tail /aws/lambda/order-vision-classification \
    --follow \
    --profile bio-rad-dev \
    --region us-east-2
```

Monitor start-processing lambda:
```bash
# Monitor start-processing lambda logs (recent entries)
aws logs filter-log-events \
    --log-group-name /aws/lambda/order-vision-start-processing \
    --start-time $(date -d '10 minutes ago' +%s)000 \
    --profile bio-rad-dev \
    --region us-east-2 \
    --output text \
    --no-paginate

# For real-time monitoring (optional - will follow logs)
aws logs tail /aws/lambda/order-vision-start-processing \
    --follow \
    --profile bio-rad-dev \
    --region us-east-2
```

### Step 4: Verify Tracking Events

Check tracking events in DynamoDB:
```bash
# Get the timestamp from your test upload
TIMESTAMP=$(node -e "console.log(new Date('2025-10-08T06:23:20.0000000Z').getTime())")

# Query tracking events
aws dynamodb query \
    --table-name order-vision-tracking-dev \
    --key-condition-expression "#timestamp = :timestamp" \
    --expression-attribute-names '{"#timestamp": "timestamp"}' \
    --expression-attribute-values "{\":timestamp\": {\"N\": \"$TIMESTAMP\"}}" \
    --profile bio-rad-dev \
    --region us-east-2 \
    --output json \
    --no-paginate
```

Check tracking lambda logs:
```bash
# Check recent tracking lambda logs
aws logs filter-log-events \
    --log-group-name /aws/lambda/order-vision-tracking-dev \
    --start-time $(date -d '10 minutes ago' +%s)000 \
    --profile bio-rad-dev \
    --region us-east-2 \
    --output text \
    --no-paginate

# For real-time monitoring (optional - will follow logs)
aws logs tail /aws/lambda/order-vision-tracking-dev \
    --follow \
    --profile bio-rad-dev \
    --region us-east-2
```

Check monitoring lambda logs:
```bash
# Check recent monitoring lambda logs
aws logs filter-log-events \
    --log-group-name /aws/lambda/order-vision-monitoring-dev \
    --start-time $(date -d '10 minutes ago' +%s)000 \
    --profile bio-rad-dev \
    --region us-east-2 \
    --output text \
    --no-paginate

# For real-time monitoring (optional - will follow logs)
aws logs tail /aws/lambda/order-vision-monitoring-dev \
    --follow \
    --profile bio-rad-dev \
    --region us-east-2
```

## 📊 Validation Checklist

### ✅ Upload Stage
- [ ] Upload tracking event created with status "started"
- [ ] Upload tracking event updated to "completed" 
- [ ] Metadata stored correctly in tracking record
- [ ] No errors in upload lambda logs

### ✅ Upload Check Stage  
- [ ] Upload check tracking event created
- [ ] Files validated successfully
- [ ] Upload check completed event recorded
- [ ] Classification lambda triggered

### ✅ Classification Stage
- [ ] Classification tracking event created with "started" status
- [ ] Document types identified correctly
- [ ] Classification completed with processing duration
- [ ] Attachments updated with Type field
- [ ] Start-processing lambda triggered for classified files

### ✅ Processing Stage
- [ ] Processing events created for each classified file
- [ ] Processing duration recorded
- [ ] SAP integration events created
- [ ] Final status shows "completed" or appropriate error status

### ✅ Tracking System
- [ ] All events stored in DynamoDB with correct schema
- [ ] TTL values set appropriately (90 days success, 365 days errors)
- [ ] SQS queue processes messages without backlog
- [ ] No messages in dead letter queue
- [ ] Monitoring lambda runs every 5 minutes without errors

### ✅ Alerting System
- [ ] Alerts sent to Teams via cloudwatch-alerts lambda
- [ ] Alert cooldowns working (no spam)
- [ ] Different severity levels working correctly
- [ ] Daily summary generated (if testing spans a day)

## 🔍 Monitoring Commands

### Real-time Event Monitoring
```bash
# Watch DynamoDB for new events
aws dynamodb scan \
    --table-name order-vision-tracking-dev \
    --filter-expression "#event_timestamp > :recent" \
    --expression-attribute-names '{"#event_timestamp": "event_timestamp"}' \
    --expression-attribute-values "{\":recent\": {\"S\": \"$(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%S.000Z)\"}}" \
    --profile bio-rad-dev \
    --region us-east-2 \
    --output json \
    --no-paginate
```

### Check SQS Queue Depth
```bash
aws sqs get-queue-attributes \
    --queue-url <tracking-queue-url> \
    --attribute-names ApproximateNumberOfVisibleMessages \
    --profile bio-rad-dev \
    --region us-east-2 \
    --output json \
    --no-paginate
```

### Check Error Rates
```bash
# Query failed events from last hour
aws dynamodb scan \
    --table-name order-vision-tracking-dev \
    --filter-expression "#status = :failed AND #event_timestamp > :recent" \
    --expression-attribute-names '{"#status": "status", "#event_timestamp": "event_timestamp"}' \
    --expression-attribute-values "{\":failed\": {\"S\": \"failed\"}, \":recent\": {\"S\": \"$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S.000Z)\"}}" \
    --profile bio-rad-dev \
    --region us-east-2 \
    --output json \
    --no-paginate
```

## 🚨 Troubleshooting

### Common Issues

**1. No Tracking Events Created**
- Check TRACKING_QUEUE_URL environment variable in existing lambdas
- Verify SQS permissions
- Check tracking lambda logs for errors

**2. Events Not Processing**
- Check SQS queue for stuck messages
- Verify tracking lambda is triggered by SQS
- Check dead letter queue for failed messages

**3. Missing Alerts**
- Verify cloudwatch-alerts lambda exists and is working
- Check alert cooldown settings
- Review monitoring lambda logs

**4. DynamoDB Errors**
- Check IAM permissions for DynamoDB access
- Verify table exists and is active
- Check for throttling issues

### Debug Commands
```bash
# Check lambda function configuration
aws lambda get-function-configuration \
    --function-name order-vision-tracking-dev \
    --profile bio-rad-dev \
    --region us-east-2 \
    --output json \
    --no-paginate

# Check SQS queue configuration
aws sqs get-queue-attributes \
    --queue-url <tracking-queue-url> \
    --attribute-names All \
    --profile bio-rad-dev \
    --region us-east-2 \
    --output json \
    --no-paginate

# Check DynamoDB table status
aws dynamodb describe-table \
    --table-name order-vision-tracking-dev \
    --profile bio-rad-dev \
    --region us-east-2 \
    --output json \
    --no-paginate
```

## 📈 Performance Testing

### Load Testing (Optional)
```bash
# Send multiple tracking events simultaneously
for i in {1..10}; do
  TIMESTAMP=$(date +%s)000
  aws sqs send-message \
    --queue-url <tracking-queue-url> \
    --message-body "{\"timestamp\": $TIMESTAMP, \"event_type\": \"test\", \"status\": \"completed\"}" \
    --profile bio-rad-dev \
    --region us-east-2 \
    --output json \
    --no-paginate &
done
wait
```

### Monitor Performance
```bash
# Check Lambda duration metrics
aws logs filter-log-events \
    --log-group-name /aws/lambda/order-vision-tracking-dev \
    --filter-pattern "REPORT" \
    --start-time $(date -d '1 hour ago' +%s)000 \
    --profile bio-rad-dev \
    --region us-east-2 \
    --output text \
    --no-paginate
```

## 🎯 Success Criteria

A successful end-to-end test should show:

1. **Complete Event Chain**: Upload → Upload Check → Classification → Processing → SAP Integration
2. **All Events Tracked**: Every stage creates appropriate tracking events
3. **Proper Status Flow**: Events progress from "started" to "completed" or "failed"
4. **Accurate Timing**: Processing durations recorded correctly
5. **Error Handling**: Failed events create error records with details
6. **Alert Generation**: Appropriate alerts sent for failures and timeouts
7. **Data Retention**: TTL values set correctly for cleanup

## 📝 Test Report Template

```
# Tracking System Test Report

**Date**: 
**Tester**: 
**Environment**: DEV
**Test Type**: End-to-End

## Test Results
- [ ] Upload tracking: ✅/❌
- [ ] Upload check tracking: ✅/❌  
- [ ] Classification tracking: ✅/❌
- [ ] Processing tracking: ✅/❌
- [ ] SAP integration tracking: ✅/❌
- [ ] Error handling: ✅/❌
- [ ] Alert generation: ✅/❌
- [ ] Performance: ✅/❌

## Issues Found
1. 
2. 

## Recommendations
1.
2.

## Overall Status: ✅ PASS / ❌ FAIL
```

---

**Remember**: Always test in DEV environment first! 🧪
