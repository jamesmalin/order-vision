#!/bin/bash

# Monitor the classification Lambda fix
# This script checks if the upload-check Lambda is now processing files

echo "=== Monitoring Classification Lambda Fix ==="
echo "Started at: $(date)"
echo ""

echo "Waiting 2 minutes for next scheduled run..."
sleep 120

echo ""
echo "=== Checking upload-check logs (last 5 minutes) ==="
aws logs tail /aws/lambda/order-vision-upload-check --since 5m --profile bio-rad-dev --region us-east-2 | grep -E "Found JSON|Running lambda|All files have been uploaded"

echo ""
echo "=== Checking classification logs (last 5 minutes) ==="
aws logs tail /aws/lambda/order-vision-classification --since 5m --profile bio-rad-dev --region us-east-2 | grep -E "Event received|Processing attachment|Classification for"

echo ""
echo "=== Checking for classification.json files in recent uploads ==="
for ts in 1763494581000 1763494624000 1763494642000; do
    echo "Checking timestamp: $ts"
    aws s3 ls s3://order-vision-ai-dev/uploads/$ts/ --profile bio-rad-dev --region us-east-2 | grep -E "classification|processed" || echo "  No classification/processed files yet"
done

echo ""
echo "=== Summary ==="
echo "If you see:"
echo "  ✅ 'Found JSON file' in upload-check logs"
echo "  ✅ 'Event received' in classification logs"
echo "  ✅ 'classification.json' files in S3"
echo "Then the fix is working!"
echo ""
echo "If not, wait another 2 minutes and run this script again."
