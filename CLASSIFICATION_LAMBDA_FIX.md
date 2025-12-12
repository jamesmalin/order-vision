# Classification Lambda Not Triggering - Root Cause & Fix

## Problem Summary
48 uploads from Nov 18-19, 2025 completed the upload stage but classification Lambda never ran, leaving uploads stuck without `classification.json` or `processed.json` files.

## Root Cause Identified

The `order-vision-upload-check` Lambda is **missing the `BUCKET_NAME` environment variable**.

### Evidence:
1. ✅ Upload Lambda is working - creates JSON files in S3 root
2. ✅ EventBridge Scheduler is ENABLED - runs every 2 minutes
3. ✅ Upload-check Lambda IS running - confirmed via logs
4. ❌ Upload-check Lambda has wrong environment variables:
   - Current: `ACCOUNT_ID=614250372661`
   - Expected: `BUCKET_NAME=order-vision-ai-dev`
5. ❌ Upload-check logs show "No files found" 38 times since Nov 18
6. ✅ JSON files ARE present in S3 root (verified)

### How the System Should Work:
1. Upload Lambda creates `{timestamp}.json` in S3 root
2. EventBridge Scheduler triggers upload-check every 2 minutes
3. Upload-check finds JSON file, verifies all files uploaded
4. Upload-check invokes classification Lambda
5. Classification Lambda processes files and creates `classification.json`
6. Classification Lambda invokes start-processing Lambda for each PO

### What's Broken:
Upload-check Lambda can't find JSON files because it's missing the `BUCKET_NAME` environment variable, so it defaults to `order-vision-ai-dev` in code but may have permission or configuration issues.

## Fix

Update the upload-check Lambda environment variables to include `BUCKET_NAME`:

```bash
aws lambda update-function-configuration \
    --region us-east-2 \
    --function-name order-vision-upload-check \
    --environment "Variables={ \
      BUCKET_NAME=order-vision-ai-dev, \
      REGION=us-east-2, \
      TRACKING_QUEUE_URL=https://sqs.us-east-2.amazonaws.com/614250372661/order-vision-tracking-queue-dev \
    }" \
    --profile bio-rad-dev
```

## Verification Steps

After applying the fix:

1. **Wait 2 minutes** for the next scheduled run
2. **Check upload-check logs** for successful processing:
   ```bash
   aws logs tail /aws/lambda/order-vision-upload-check --since 5m --profile bio-rad-dev --region us-east-2
   ```
3. **Verify classification runs** for pending uploads:
   ```bash
   aws logs tail /aws/lambda/order-vision-classification --since 5m --profile bio-rad-dev --region us-east-2
   ```
4. **Check S3 for classification.json** files:
   ```bash
   aws s3 ls s3://order-vision-ai-dev/uploads/1763494581000/ --profile bio-rad-dev --region us-east-2
   ```

## Affected Uploads

All 48 uploads from Nov 18-19, 2025 are stuck and will be processed once the fix is applied:
- Timestamps range from 1763424442000 to 1763561211000
- Includes 10 "SoldTo" test uploads from iqbal_khan@bio-rad.com
- All have `processing.txt` removed (indicating upload-check ran but failed)
- None have `classification.json` or `processed.json`

## Prevention

To prevent this in the future:

1. **Add environment variable validation** to upload-check Lambda startup
2. **Add CloudWatch alarm** for upload-check failures
3. **Document required environment variables** in README
4. **Add integration tests** that verify the full pipeline

## Additional Notes

- Last successful classification: November 17, 2025 at 23:08 UTC
- Upload-check Lambda last updated: October 9, 2025
- Environment variable likely removed during an update
- No errors in CloudWatch logs (Lambda runs but finds no files)
