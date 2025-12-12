#!/bin/bash

# Multi-PO Support End-to-End Test Script
# This script tests the multi-PO feature using real PDF files

set -e  # Exit on error

echo "=========================================="
echo "Multi-PO Support - End-to-End Test"
echo "Environment: DEV"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -d "lambda/upload" ] || [ ! -d "pdfs" ]; then
    echo "Error: Must run from project root directory"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "Error: .env file not found"
    exit 1
fi

# Check if test files exist
if [ ! -f "pdfs/3012_1096188_1007631125_2120027_49249285.pdf" ]; then
    echo "Error: Test PDF file not found: pdfs/3012_1096188_1007631125_2120027_49249285.pdf"
    exit 1
fi

if [ ! -f "pdfs/3019_1100108_1008131189_2122935_242424.pdf" ]; then
    echo "Error: Test PDF file not found: pdfs/3019_1100108_1008131189_2122935_242424.pdf"
    exit 1
fi

echo "Step 1: Getting Presigned URLs from Upload API..."
echo "=========================================="
cd lambda/upload

# Get authorization token
AUTHORIZATION_TOKEN=$(grep ^AUTHORIZATION_DEV= ../../.env | cut -d '=' -f2-)

if [ -z "$AUTHORIZATION_TOKEN" ]; then
    echo "Error: AUTHORIZATION_DEV not found in .env file"
    exit 1
fi

# Call upload API
echo "Calling upload API..."
curl --request POST \
  -H "Authorization: $AUTHORIZATION_TOKEN" \
  -H "Content-Type: application/json" \
  --data "@test-multi-po-real.json" \
  https://b0jziam8t1.execute-api.us-east-2.amazonaws.com/dev/order-vision/upload \
  > API-response.json

# Check if request was successful
if [ ! -s API-response.json ]; then
    echo "Error: API response is empty"
    exit 1
fi

echo "✅ Presigned URLs received"
echo ""

# Display response
echo "API Response:"
cat API-response.json | jq '.'
echo ""

# Extract URLs
URL_PO1=$(cat API-response.json | jq -r '.body[0].Url')
URL_PO2=$(cat API-response.json | jq -r '.body[1].Url')
TIMESTAMP=$(cat API-response.json | jq -r '.body[0].FileKey' | cut -d'/' -f2)

echo "Timestamp: $TIMESTAMP"
echo ""

echo "Step 2: Uploading PDF Files to S3..."
echo "=========================================="

# Upload first PO
echo "Uploading PO #1: 3012_1096188_1007631125_2120027_49249285.pdf..."
curl --request PUT \
  --upload-file "../../pdfs/3012_1096188_1007631125_2120027_49249285.pdf" \
  --header "Content-Type: application/octet-stream" \
  "$URL_PO1"

echo "✅ PO #1 uploaded"

# Upload second PO
echo "Uploading PO #2: 3019_1100108_1008131189_2122935_242424.pdf..."
curl --request PUT \
  --upload-file "../../pdfs/3019_1100108_1008131189_2122935_242424.pdf" \
  --header "Content-Type: application/octet-stream" \
  "$URL_PO2"

echo "✅ PO #2 uploaded"
echo ""

cd ../..

echo "Step 3: Monitoring Processing..."
echo "=========================================="
echo ""
echo "Files uploaded successfully!"
echo "Timestamp: $TIMESTAMP"
echo ""
echo "The upload-check lambda runs every minute via EventBridge."
echo "Processing will begin automatically within 60 seconds."
echo ""
echo "To monitor in real-time, open separate terminals and run:"
echo ""
echo "Terminal 1 (Classification):"
echo "  aws logs tail /aws/lambda/order-vision-classification --follow --profile bio-rad-dev"
echo ""
echo "Terminal 2 (Start-Processing):"
echo "  aws logs tail /aws/lambda/order-vision-start-processing --follow --profile bio-rad-dev"
echo ""
echo "Terminal 3 (Upload-Check):"
echo "  aws logs tail /aws/lambda/order-vision-upload-check --follow --profile bio-rad-dev"
echo ""
echo "=========================================="
echo "Verification Commands"
echo "=========================================="
echo ""
echo "After processing completes (~3-5 minutes), verify results:"
echo ""
echo "# List all files in upload directory"
echo "aws s3 ls s3://order-vision-ai-dev/uploads/$TIMESTAMP/ --profile bio-rad-dev"
echo ""
echo "# Download classification.json"
echo "aws s3 cp s3://order-vision-ai-dev/uploads/$TIMESTAMP/classification.json . --profile bio-rad-dev"
echo ""
echo "# Download processed files"
echo "aws s3 cp s3://order-vision-ai-dev/uploads/$TIMESTAMP/processed-3012_1096188_1007631125_2120027_49249285_pdf.json . --profile bio-rad-dev"
echo "aws s3 cp s3://order-vision-ai-dev/uploads/$TIMESTAMP/processed-3019_1100108_1008131189_2122935_242424_pdf.json . --profile bio-rad-dev"
echo ""
echo "# Check classification results"
echo "cat classification.json | jq '.metadata.Attachments[] | {AttachmentName, Type}'"
echo ""
echo "# Verify both processed files exist"
echo "ls -lh processed-*.json"
echo ""
echo "=========================================="
echo "Expected Results"
echo "=========================================="
echo ""
echo "✅ Both POs classified as 'Purchase Order'"
echo "✅ Classification logs show: 'Found 2 Purchase Order(s) - processing with max concurrency of 2'"
echo "✅ Classification logs show: 'Processing batch 1: [PO1, PO2]'"
echo "✅ Two processed files created with unique names"
echo "✅ Both POs sent to SAP"
echo "✅ Tracking events recorded for each PO"
echo ""
echo "Test initiated! Timestamp: $TIMESTAMP"
echo ""
