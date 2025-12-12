# Order Vision Audit Lambda

Lambda function to search S3 uploads by email metadata (Subject, From, To, Cc, EmailId). This provides a more efficient way to find uploads without needing to know attachment filenames.

## Features

- Search by email metadata fields (case-insensitive partial matching)
- Parallel processing for fast results
- Returns comprehensive information including:
  - Full metadata
  - All files in each upload directory
  - Direct S3 URIs for all files
  - Processing status
  - Classification results (if available)

## Dependencies

```bash
npm install @aws-sdk/client-s3 dotenv
```

## Zip

```bash
cd lambda/audit
rm order-vision-audit.zip
npm ci --only=production
zip -r9 order-vision-audit.zip index.mjs node_modules
rm -rf node_modules
```

# DEV

## Create function

```bash
aws lambda create-function \
    --runtime nodejs22.x \
    --function-name order-vision-audit \
    --handler index.handler \
    --zip-file fileb://order-vision-audit.zip \
    --role arn:aws:iam::614250372661:role/service-role/order-vision-upload-role-hv9lejlk \
    --timeout 60 \
    --environment Variables="{ \
      BUCKET_NAME=order-vision-ai-dev, \
      REGION=us-east-2 \
    }" \
    --profile bio-rad-dev
```

## Update function

```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name order-vision-audit \
    --zip-file fileb://order-vision-audit.zip \
    --profile bio-rad-dev
```

## Check config

```bash
aws lambda get-function-configuration \
    --region us-east-2 \
    --function-name order-vision-audit \
    --profile bio-rad-dev
```

## Update environment variables

```bash
aws lambda update-function-configuration \
    --region us-east-2 \
    --function-name order-vision-audit \
    --environment "Variables={\
BUCKET_NAME=order-vision-ai-dev,\
REGION=us-east-2\
}" \
    --profile bio-rad-dev
```

# QA

## Create function

```bash
aws lambda create-function \
    --runtime nodejs22.x \
    --function-name order-vision-audit \
    --handler index.handler \
    --zip-file fileb://order-vision-audit.zip \
    --role arn:aws:iam::367995044692:role/service-role/order-vision-upload-role-1eyc60zh \
    --timeout 60 \
    --environment Variables="{ \
      BUCKET_NAME=order-vision-ai-qa, \
      REGION=us-east-2 \
    }" \
    --profile bio-rad-qa
```

## Update function

```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name order-vision-audit \
    --zip-file fileb://order-vision-audit.zip \
    --profile bio-rad-qa
```

## Check config

```bash
aws lambda get-function-configuration \
    --region us-east-2 \
    --function-name order-vision-audit \
    --profile bio-rad-qa
```

# PROD

## Create function

```bash
aws lambda create-function \
    --runtime nodejs22.x \
    --function-name order-vision-audit \
    --handler index.handler \
    --zip-file fileb://order-vision-audit.zip \
    --role arn:aws:iam::954366782091:role/order-vision-upload-role-1eyc60zh \
    --timeout 60 \
    --environment Variables="{ \
      BUCKET_NAME=order-vision-ai-prod, \
      REGION=us-east-2 \
    }" \
    --profile bio-rad-prod
```

## Update function

```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name order-vision-audit \
    --zip-file fileb://order-vision-audit.zip \
    --profile bio-rad-prod
```

## Check config

```bash
aws lambda get-function-configuration \
    --region us-east-2 \
    --function-name order-vision-audit \
    --profile bio-rad-prod
```

# IAM Permissions

The Lambda function requires read-only S3 access:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "logs:CreateLogGroup",
            "Resource": "arn:aws:logs:us-east-2:*:*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": [
                "arn:aws:logs:us-east-2:*:log-group:/aws/lambda/order-vision-*:*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::order-vision-ai-dev",
                "arn:aws:s3:::order-vision-ai-qa",
                "arn:aws:s3:::order-vision-ai-prod"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject"
            ],
            "Resource": [
                "arn:aws:s3:::order-vision-ai-dev/*",
                "arn:aws:s3:::order-vision-ai-qa/*",
                "arn:aws:s3:::order-vision-ai-prod/*"
            ]
        }
    ]
}
```

# Usage Examples

## Search by Subject

Search for uploads with "Customer Quote Request" in the subject (last 10 uploads):

```bash
aws lambda invoke \
    --function-name order-vision-audit \
    --payload '{"subject":"Shipto"}' \
    --profile bio-rad-dev \
    response.json && cat response.json | jq

aws lambda invoke \
    --function-name order-vision-audit \
    --payload file://lambda/audit/test-event.json \
    --profile bio-rad-dev \
    response.json && cat response.json | jq

```

## Search by Sender

Search for uploads from a specific sender:

```bash
aws lambda invoke \
    --function-name order-vision-audit \
    --payload '{"from":"iqbal_khan@bio-rad.com","limit":20}' \
    --profile bio-rad-dev \
    response.json && cat response.json | jq
```

## Search by Quote Number in Subject

Search for a specific quote number (e.g., 10000170911):

```bash
aws lambda invoke \
    --function-name order-vision-audit \
    --payload '{"subject":"AU","limit":30}' \
    --profile bio-rad-prod \
    response.json && cat response.json | jq
```

## Search by Recipient

Search for uploads sent to a specific email:

```bash
aws lambda invoke \
    --function-name order-vision-audit \
    --payload '{"to":"Customer.service.hk@bio-rad.com"}' \
    --profile bio-rad-prod \
    response.json && cat response.json | jq
```

## Multiple Search Criteria

Combine multiple search criteria:

```bash
aws lambda invoke \
    --function-name order-vision-audit \
    --payload '{"subject":"HCPA","from":"diasam.com.br","limit":50}' \
    --profile bio-rad-prod \
    response.json && cat response.json | jq

aws lambda invoke \
    --function-name order-vision-audit \
    --payload '{"subject":"QU","limit":50}' \
    --profile bio-rad-dev \
    response.json && cat response.json | jq
```

## Search with Custom Limit

Search the last 50 uploads:

```bash
aws lambda invoke \
    --function-name order-vision-audit \
    --payload '{"subject":"Queensland","limit":10}' \
    --profile bio-rad-qa \
    response.json && cat response.json | jq
```

# Request Format

```json
{
  "subject": "Customer Quote Request",
  "from": "edman_cheng@bio-rad.com",
  "to": "customer.service",
  "cc": "vendas@diasam.com.br",
  "emailId": "exact-email-id",
  "limit": 10
}
```

All fields are optional. If no search criteria are provided, all recent uploads (up to limit) will be returned.

# Response Format

```json
{
  "matches": [
    {
      "timestamp": "1761833402000",
      "s3Path": "s3://order-vision-ai-prod/uploads/1761833402000/",
      "metadata": {
        "CreatedOn": "2025-10-30T14:10:02.0000000Z",
        "EmailId": "",
        "Subject": "HCPA 148157/8",
        "From": "ana@diasam.com.br",
        "To": ["ov.atendimento@Bio-Rad.com"],
        "Cc": ["vendas@diasam.com.br"],
        "Body": "",
        "Attachments": [
          {"AttachmentName": "HCPA.148157-8.pdf"},
          {"AttachmentName": "MailPdf20251030 101831.pdf"}
        ]
      },
      "files": [
        {
          "name": "HCPA.148157-8.pdf",
          "s3Uri": "s3://order-vision-ai-prod/uploads/1761833402000/HCPA.148157-8.pdf",
          "size": 280298,
          "lastModified": "2025-10-30T14:10:02Z"
        },
        {
          "name": "MailPdf20251030 101831.pdf",
          "s3Uri": "s3://order-vision-ai-prod/uploads/1761833402000/MailPdf20251030 101831.pdf",
          "size": 133096,
          "lastModified": "2025-10-30T14:10:03Z"
        },
        {
          "name": "metadata.json",
          "s3Uri": "s3://order-vision-ai-prod/uploads/1761833402000/metadata.json",
          "size": 409,
          "lastModified": "2025-10-30T14:10:04Z"
        },
        {
          "name": "processing.txt",
          "s3Uri": "s3://order-vision-ai-prod/uploads/1761833402000/processing.txt",
          "size": 0,
          "lastModified": "2025-10-30T14:10:05Z"
        },
        {
          "name": "classification.json",
          "s3Uri": "s3://order-vision-ai-prod/uploads/1761833402000/classification.json",
          "size": 631,
          "lastModified": "2025-10-30T14:51:12Z"
        }
      ],
      "hasProcessingFlag": true,
      "hasClassification": true,
      "classification": {
        "RRC": "12345",
        "QuoteNumber": "Q-2025-001"
      }
    }
  ],
  "searchedCount": 10,
  "matchCount": 1,
  "searchCriteria": {
    "subject": "HCPA",
    "limit": 10,
    "bucket": "order-vision-ai-prod"
  }
}
```

# Search Behavior

- **Case-insensitive**: All text searches are case-insensitive
- **Partial matching**: Searches match substrings (e.g., "bio-rad" matches "edman_cheng@bio-rad.com")
- **Array fields**: For To and Cc fields, the search matches if ANY element in the array contains the search term
- **EmailId**: Exact match only (not partial)
- **Multiple criteria**: When multiple search criteria are provided, ALL must match (AND logic)

# Notes

- The function searches the most recent N uploads (default 10, configurable via `limit` parameter)
- Uploads are sorted by timestamp in descending order (most recent first)
- Processing is done in parallel for better performance
- If a metadata.json file is missing or corrupted, that upload is skipped
- Classification data is included in results if available
