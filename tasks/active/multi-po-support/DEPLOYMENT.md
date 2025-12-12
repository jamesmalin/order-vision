# Multi-PO Support - Deployment Guide

## Overview
This guide covers the deployment process for the multi-PO support feature, which enables processing of multiple Purchase Orders from a single email submission.

## Changes Summary

### Files Modified
1. **lambda/classification/index.mjs** - Added batch processing logic for multiple POs
2. **lambda/start-processing/index.mjs** - Added PO selection logic and unique file naming

### New Files Created
1. **lambda/classification/test-multi-po-event.json** - Sample test event with 2 POs
2. **tasks/active/multi-po-support/README.md** - Task documentation
3. **tasks/active/multi-po-support/DEPLOYMENT.md** - This file

## Pre-Deployment Checklist

- [ ] Review all code changes in classification and start-processing lambdas
- [ ] Verify test event structure matches expected format
- [ ] Ensure AWS credentials are configured
- [ ] Confirm target environment (dev/qa/prod)
- [ ] Review environment variables to be added

## Environment Variables

### Classification Lambda
Add the following environment variable:

```bash
MAX_CONCURRENT_POS=2
```

**Configuration Notes:**
- Default value: `2` (if not set)
- Recommended starting value: `2`
- Can be increased to `3-4` after monitoring API performance
- Should not exceed `5` to maintain system stability

### Start-Processing Lambda
No new environment variables required. The lambda will automatically:
- Check for `event.currentPO` parameter
- Fall back to first PO if not specified (backward compatibility)

## Deployment Steps

### 1. Deploy Classification Lambda

```bash
# Navigate to classification lambda directory
cd lambda/classification

# Clean and prepare
rm order-vision-classification.zip
rm -rf node_modules

# Install production dependencies only
npm ci --only=production

# Package the lambda with specific files (not everything)
zip -r order-vision-classification.zip node_modules .env index.mjs tracking-utils.mjs rrc-number.mjs credentials-documentai.json

# Deploy using AWS CLI with bio-rad-dev profile
aws lambda update-function-code \
  --region us-east-2 \
  --function-name order-vision-classification \
  --zip-file fileb://order-vision-classification.zip \
  --profile bio-rad-dev

# Update environment variables (includes MAX_CONCURRENT_POS=2)
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
```

### 2. Deploy Start-Processing Lambda

```bash
# Navigate to start-processing lambda directory
cd lambda/start-processing

# Clean and prepare
rm order-vision-start-processing.zip
rm -rf node_modules

# Install production dependencies only
npm ci --only=production

# Package the lambda with specific files (not everything)
zip -r9 order-vision-start-processing.zip node_modules .env index.mjs tracking-utils.mjs invoke-auth.mjs anthropic.mjs extract-materials.mjs format-dates.mjs translate.mjs search.mjs search-material.mjs search-accountmanager.mjs search-customer.mjs knvp-check.mjs quote-number.mjs rrc-number.mjs knvp.json states.json credentials-documentai.json

# Deploy using AWS CLI with bio-rad-dev profile
aws lambda update-function-code \
  --region us-east-2 \
  --function-name order-vision-start-processing \
  --zip-file fileb://order-vision-start-processing.zip \
  --profile bio-rad-dev
```

### 3. Verify Deployment

```bash
# Check classification lambda configuration
aws lambda get-function-configuration \
  --region us-east-2 \
  --function-name order-vision-classification \
  --profile bio-rad-dev

# Check start-processing lambda configuration
aws lambda get-function-configuration \
  --region us-east-2 \
  --function-name order-vision-start-processing \
  --profile bio-rad-dev

# Verify MAX_CONCURRENT_POS is set
aws lambda get-function-configuration \
  --region us-east-2 \
  --function-name order-vision-classification \
  --profile bio-rad-dev \
  --query 'Environment.Variables.MAX_CONCURRENT_POS'
```

## Testing

### Test Scenario 1: Two POs (Basic Multi-PO)

**Expected Behavior:**
1. Classification lambda identifies 2 PO attachments
2. Invokes start-processing twice (batch of 2)
3. Each PO generates its own processed file:
   - `processed-PO_12345_pdf.json`
   - `processed-PO_67890_pdf.json`
4. Both POs receive RRC numbers from customer inquiry
5. Both POs are sent to SAP independently

**Test Command:**
```bash
aws lambda invoke \
  --function-name order-vision-classification \
  --payload file://lambda/classification/test-multi-po-event.json \
  --region us-east-2 \
  response.json
```

**Verification:**
```bash
# Check CloudWatch logs for classification
aws logs tail /aws/lambda/order-vision-classification --follow

# Check CloudWatch logs for start-processing
aws logs tail /aws/lambda/order-vision-start-processing --follow

# Check S3 for processed files
aws s3 ls s3://order-vision-ai-dev/uploads/1234567890000/
```

### Test Scenario 2: Single PO (Backward Compatibility)

Create a test event with only 1 PO attachment and verify it processes as before.

### Test Scenario 3: Three POs (Batch Processing)

Create a test event with 3 PO attachments and verify:
- Batch 1: 2 POs processed
- 2-second delay
- Batch 2: 1 PO processed

## Monitoring

### Key Metrics to Monitor

1. **Lambda Invocations**
   - Classification lambda invocation count
   - Start-processing lambda invocation count (should match number of POs)

2. **Processing Duration**
   - Classification lambda duration
   - Start-processing lambda duration per PO
   - Total time from classification to all POs completed

3. **API Calls**
   - Azure Document Intelligence API calls
   - OpenAI API calls
   - Monitor for rate limit errors

4. **S3 Files**
   - Verify unique processed-*.json files created
   - Check for file naming conflicts

5. **SAP Deliveries**
   - Verify each PO sent to SAP independently
   - Check SAP delivery success rates

### CloudWatch Queries

**Count PO invocations per email:**
```
fields @timestamp, @message
| filter @message like /Found.*Purchase Order/
| parse @message /Found (?<count>\d+) Purchase Order/
| stats count() by count
```

**Track batch processing:**
```
fields @timestamp, @message
| filter @message like /Processing batch/
| parse @message /Processing batch (?<batch>\d+)/
| stats count() by batch
```

**Monitor invocation success/failure:**
```
fields @timestamp, @message
| filter @message like /PO processing invocations/
| parse @message /(?<successful>\d+) successful, (?<failed>\d+) failed/
```

## Rollback Plan

If issues are encountered:

### 1. Quick Rollback (Environment Variable)
```bash
# Set MAX_CONCURRENT_POS to 1 to effectively disable multi-PO
aws lambda update-function-configuration \
  --function-name order-vision-classification \
  --environment Variables="{MAX_CONCURRENT_POS=1}" \
  --region us-east-2
```

### 2. Full Rollback (Code)
```bash
# Revert to previous lambda versions
aws lambda update-function-code \
  --function-name order-vision-classification \
  --s3-bucket <backup-bucket> \
  --s3-key classification-backup.zip \
  --region us-east-2

aws lambda update-function-code \
  --function-name order-vision-start-processing \
  --s3-bucket <backup-bucket> \
  --s3-key start-processing-backup.zip \
  --region us-east-2
```

## Post-Deployment Validation

### Day 1: Initial Monitoring
- [ ] Monitor CloudWatch logs for errors
- [ ] Verify multi-PO emails process correctly
- [ ] Check S3 for proper file creation
- [ ] Verify SAP deliveries for each PO
- [ ] Monitor API rate limits

### Week 1: Performance Tuning
- [ ] Analyze batch processing performance
- [ ] Review API call patterns
- [ ] Adjust MAX_CONCURRENT_POS if needed
- [ ] Monitor error rates and alerts

### Week 2: Optimization
- [ ] Consider removing inter-batch delay if not needed
- [ ] Evaluate increasing MAX_CONCURRENT_POS to 3
- [ ] Review tracking data for insights
- [ ] Document any issues or improvements needed

## Troubleshooting

### Issue: POs Not Processing
**Symptoms:** Classification completes but start-processing not invoked
**Check:**
- CloudWatch logs for invocation errors
- Lambda permissions for cross-invocation
- Event payload structure

**Solution:**
```bash
# Check Lambda execution role permissions
aws lambda get-function \
  --function-name order-vision-classification \
  --query 'Configuration.Role'
```

### Issue: S3 File Conflicts
**Symptoms:** Processed files overwriting each other
**Check:**
- File naming in CloudWatch logs
- S3 bucket contents for duplicate names

**Solution:**
- Verify `sanitizedPOName` logic is working
- Check for special characters in PO filenames

### Issue: API Rate Limits
**Symptoms:** Azure or OpenAI errors in logs
**Check:**
- API call frequency in CloudWatch
- Number of concurrent lambdas running

**Solution:**
```bash
# Reduce concurrency
aws lambda update-function-configuration \
  --function-name order-vision-classification \
  --environment Variables="{MAX_CONCURRENT_POS=1}" \
  --region us-east-2
```

### Issue: Partial Failures
**Symptoms:** Some POs process, others fail
**Check:**
- CloudWatch logs for specific PO errors
- Alert messages for failed invocations

**Solution:**
- Review error messages for specific PO
- Check if PO file exists in S3
- Verify PO attachment metadata

## Success Criteria

### Functional Success
- ✅ Multiple POs from single email all process
- ✅ Each PO generates unique processed file
- ✅ Each PO sent to SAP independently
- ✅ RRC numbers shared across all POs
- ✅ Single PO emails still work (backward compatibility)

### Performance Success
- ✅ No API rate limit errors
- ✅ Processing time scales linearly with PO count
- ✅ Batch processing completes within Lambda timeout
- ✅ No S3 file conflicts

### Operational Success
- ✅ Proper tracking events for each PO
- ✅ Alerts generated for failures
- ✅ CloudWatch logs show clear processing flow
- ✅ No increase in error rates

## Environment-Specific Notes

### Development (DEV)
- Use `MAX_CONCURRENT_POS=2` for testing
- Monitor closely for any issues
- Test with various PO counts (1, 2, 3, 5)

### QA/Staging
- Use `MAX_CONCURRENT_POS=2` initially
- Perform comprehensive testing
- Validate with real-world PO samples

### Production (PROD)
- Start with `MAX_CONCURRENT_POS=2`
- Monitor for 1 week before adjusting
- Consider increasing to 3 after validation
- Never exceed 5 concurrent POs

## Support Contacts

For issues or questions during deployment:
- **Development Team**: [Contact info]
- **AWS Support**: [Support case process]
- **On-Call Engineer**: [Contact info]

## Deployment History

| Date | Environment | Version | Deployed By | Notes |
|------|-------------|---------|-------------|-------|
| 2025-11-03 | DEV | 1.0.0 | TBD | Initial multi-PO deployment |
| | QA | | | |
| | PROD | | | |
