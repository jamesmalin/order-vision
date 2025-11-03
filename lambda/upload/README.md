# Dependencies
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner @aws-sdk/client-lambda dotenv
```

# Zip
```bash
rm order-vision-upload.zip
npm ci --only=production
zip -r9 order-vision-upload.zip index.mjs email-utils.mjs tracking-utils.mjs node_modules
rm -rf node_modules
```

# DEV

## Create function
```bash
aws lambda create-function \
    --runtime nodejs22.x \
    --function-name order-vision-upload \
    --handler index.handler \
    --zip-file fileb://order-vision-upload.zip \
    --role arn:aws:iam::614250372661:role/service-role/order-vision-upload-role-hv9lejlk \
    --timeout 60 \
    --environment Variables="{ \
      BUCKET_NAME=order-vision-ai-dev, \
    }" \
    --profile bio-rad-dev
```

## Update function
```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name order-vision-upload \
    --zip-file fileb://order-vision-upload.zip \
    --profile bio-rad-dev
```

## Check config
```bash
aws lambda get-function-configuration \
    --region us-east-2 \
    --function-name order-vision-upload \
    --profile bio-rad-dev
```

```bash
aws lambda update-function-configuration \
    --region us-east-2 \
    --function-name order-vision-upload \
    --environment "Variables={\
BUCKET_NAME=order-vision-ai-dev,\
TRACKING_QUEUE_URL=https://sqs.us-east-2.amazonaws.com/614250372661/order-vision-tracking-queue-dev,\
}" \
    --profile bio-rad-dev
```

# Upload Permissions
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": "arn:aws:s3:::order-vision-ai-dev"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:PutObjectTagging",
                "s3:DeleteObject"
            ],
            "Resource": [
                "arn:aws:s3:::order-vision-ai-dev/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue"
            ],
            "Resource": [
                "*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "lambda:InvokeAsync",
                "lambda:InvokeFunction"
            ],
            "Resource": [
                "*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": "iam:PassRole",
            "Resource": "*",
            "Condition": {
                "StringEquals": {
                    "iam:PassedToService": [
                        "lambda.amazonaws.com",
                        "scheduler.amazonaws.com"
                    ]
                }
            }
        }
    ]
}
```

Trust entities:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": [
                    "lambda.amazonaws.com",
                    "scheduler.amazonaws.com"
                ]
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

# QA

## Create function
```bash
aws lambda create-function \
    --runtime nodejs22.x \
    --function-name order-vision-upload \
    --handler index.handler \
    --zip-file fileb://order-vision-upload.zip \
    --role arn:aws:iam::367995044692:role/service-role/order-vision-upload-role-1eyc60zh \
    --timeout 60 \
    --environment Variables="{ \
      BUCKET_NAME=order-vision-ai-qa, \
    }" \
    --profile bio-rad-qa
```

## Update function
```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name order-vision-upload \
    --zip-file fileb://order-vision-upload.zip \
    --profile bio-rad-qa
```

## Check config
```bash
aws lambda get-function-configuration \
    --region us-east-2 \
    --function-name order-vision-upload \
    --profile bio-rad-qa
```

# Upload Permissions
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "logs:CreateLogGroup",
            "Resource": "arn:aws:logs:us-east-2:367995044692:*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": [
                "arn:aws:logs:us-east-2:367995044692:log-group:/aws/lambda/order-vision-*:*"
            ]
        },
        {
            "Sid": "Statement1",
            "Effect": "Allow",
            "Action": [
                "ec2:CreateNetworkInterface",
                "ec2:DescribeNetworkInterfaces",
                "ec2:DeleteNetworkInterface",
                "ec2:DeleteNetworkInterfacePermission"
            ],
            "Resource": [
                "*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": "arn:aws:s3:::order-vision-ai-qa"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:PutObjectTagging",
                "s3:DeleteObject"
            ],
            "Resource": [
                "arn:aws:s3:::order-vision-ai-qa/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue"
            ],
            "Resource": [
                "*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "lambda:InvokeAsync",
                "lambda:InvokeFunction"
            ],
            "Resource": [
                "*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": "iam:PassRole",
            "Resource": "*",
            "Condition": {
                "StringEquals": {
                    "iam:PassedToService": [
                        "lambda.amazonaws.com",
                        "scheduler.amazonaws.com"
                    ]
                }
            }
        }
    ]
}
```

Trust entities:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": [
                    "lambda.amazonaws.com",
                    "scheduler.amazonaws.com"
                ]
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

Example Request Contents:
```JSON
{
  "CreatedOn": "2025-03-27T00:00:00.000Z",
  "EmailId": "",
  "Subject": "",
  "From": "",
  "To": [],
  "Cc": [],
  "Body": "",
  "Attachments": [
    {
      "AttachmentName": "ABC.PDF"
    }
  ]
}
```

# PROD

## Create function
```bash
aws lambda create-function \
    --runtime nodejs22.x \
    --function-name order-vision-upload \
    --handler index.handler \
    --zip-file fileb://order-vision-upload.zip \
    --role arn:aws:iam::954366782091:role/order-vision-upload-role-1eyc60zh \
    --timeout 60 \
    --environment Variables="{ \
      BUCKET_NAME=order-vision-ai-prod, \
    }" \
    --profile bio-rad-prod
```

## Update function
```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name order-vision-upload \
    --zip-file fileb://order-vision-upload.zip \
    --profile bio-rad-prod
```

## Check config
```bash
aws lambda get-function-configuration \
    --region us-east-2 \
    --function-name order-vision-upload \
    --profile bio-rad-prod
```

# Upload Permissions
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "logs:CreateLogGroup",
            "Resource": "arn:aws:logs:us-east-2:954366782091:*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogStream",
                "logs:PutLogEvents"
            ],
            "Resource": [
                "arn:aws:logs:us-east-2:954366782091:log-group:/aws/lambda/order-vision-*:*"
            ]
        },
        {
            "Sid": "Statement1",
            "Effect": "Allow",
            "Action": [
                "ec2:CreateNetworkInterface",
                "ec2:DescribeNetworkInterfaces",
                "ec2:DeleteNetworkInterface",
                "ec2:DeleteNetworkInterfacePermission"
            ],
            "Resource": [
                "*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": "arn:aws:s3:::order-vision-ai-prod"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:PutObjectTagging",
                "s3:DeleteObject"
            ],
            "Resource": [
                "arn:aws:s3:::order-vision-ai-prod/*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue"
            ],
            "Resource": [
                "*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "lambda:InvokeAsync",
                "lambda:InvokeFunction"
            ],
            "Resource": [
                "*"
            ]
        },
        {
            "Effect": "Allow",
            "Action": "iam:PassRole",
            "Resource": "*",
            "Condition": {
                "StringEquals": {
                    "iam:PassedToService": [
                        "lambda.amazonaws.com",
                        "scheduler.amazonaws.com"
                    ]
                }
            }
        }
    ]
}
```

Trust entities:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": [
                    "lambda.amazonaws.com",
                    "scheduler.amazonaws.com"
                ]
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
```

# Upload Request API Call Flow
## Step 1 - Passing Variables
### Request
#### DEV
```bash
AUTHORIZATION_TOKEN=$(grep ^AUTHORIZATION_DEV= ../../.env | cut -d '=' -f2-)
curl --request POST -H "Authorization: $AUTHORIZATION_TOKEN" -H "Content-Type: application/json" --data "@test.json" https://b0jziam8t1.execute-api.us-east-2.amazonaws.com/dev/order-vision/upload > API-response.json
```


curl --request POST -H "Authorization: EEEmoY9FshUl6j2Ec7mRTlP9t/h+p36T1fBptOM0aMQ=" -H "Content-Type: application/json" --data "@test.json" https://dev.git-api.bio-rad.com/order-vision/upload > API-response.json

curl --request POST -H "Content-Type: application/json" --data "@test.json" https://rwwtovyvczdj7viyjjrnfegdda0jjxxp.lambda-url.us-west-2.on.aws/ > API-response.json

#### QA
```bash
AUTHORIZATION_TOKEN=$(grep ^AUTHORIZATION_QA= ../../.env | cut -d '=' -f2-)
curl --request POST -H "Authorization: $AUTHORIZATION_TOKEN" -H "Content-Type: application/json" --data "@test.json" https://ueeobeir1a.execute-api.us-east-2.amazonaws.com/qa/order-vision/upload > API-response.json
```

#### PROD
```bash
AUTHORIZATION_TOKEN=$(grep ^AUTHORIZATION_PROD= ../../.env | cut -d '=' -f2-)
curl --request POST -H "Authorization: $AUTHORIZATION_TOKEN" -H "Content-Type: application/json" --data "@test.json" https://sa9xvletpi.execute-api.us-east-2.amazonaws.com/prod/order-vision/upload > API-response.json
```


## Step 2 - Uploading Files
### Request
```bash
curl --request PUT \
  --upload-file "../contract-demo-docs/3000212583/11_19_2024/18_09_03/TWAH 24002 D-100 RR (24-D05690V6)_HK Adventist Hospital_DD Approval.pdf" \
  --header "Content-Type: application/octet-stream" \
  "Signed_S3_Url"
```