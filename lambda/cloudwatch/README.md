# CloudWatch Alerts Lambda

This Lambda function processes CloudWatch alerts and can send notifications to Microsoft Teams while logging custom metrics back to CloudWatch.

## Dependencies
```bash
npm install @aws-sdk/client-cloudwatch
```

## Environment Variables
- `REGION`: AWS region (default: us-east-2)
- `TEAMS_WEBHOOK_URL`: Microsoft Teams webhook URL for notifications (optional)

## Zip
```bash
rm cloudwatch-alerts.zip
npm ci --only=production
zip -r9 cloudwatch-alerts.zip index.mjs node_modules package.json
rm -rf node_modules
```

# DEV

## Create function
```bash
aws lambda create-function \
    --runtime nodejs22.x \
    --function-name cloudwatch-alerts \
    --handler index.handler \
    --zip-file fileb://cloudwatch-alerts.zip \
    --role arn:aws:iam::614250372661:role/service-role/order-vision-upload-role-hv9lejlk \
    --timeout 60 \
    --environment Variables="{ \
      REGION=us-east-2, \
      TEAMS_WEBHOOK_URL=https://prod-26.westus.logic.azure.com:443/workflows/a6dc1e7f0b5d4765a4e7dae94358e321/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=SvC97DKeKHhm57YerMpqXLG6IoQAhkPApVtqMwxsu0w \
    }" \
    --profile bio-rad-dev
```

## Update function
```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name cloudwatch-alerts \
    --zip-file fileb://cloudwatch-alerts.zip \
    --profile bio-rad-dev
```

## Check config
```bash
aws lambda get-function-configuration \
    --region us-east-2 \
    --function-name cloudwatch-alerts \
    --profile bio-rad-dev
```

## Update function config
```bash
aws lambda update-function-configuration \
    --region us-east-2 \
    --function-name cloudwatch-alerts \
    --environment Variables="{ \
      REGION=us-east-2, \
      TEAMS_WEBHOOK_URL=https://defaultef0aebeb2af047a3b8ae5665f8a62d.11.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/a6dc1e7f0b5d4765a4e7dae94358e321/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=vbIVnOTnwbWzqpzKjxUnxHJNp2hAcxTNZQ86w5m_YBE \
    }" \
    --profile bio-rad-dev
```

# CloudWatch Permissions
The lambda uses the same role as the upload function. To enable CloudWatch metrics logging, add the following policy to the role:

## Add CloudWatch Permissions to Role
```bash
# DEV Environment
aws iam put-role-policy \
    --role-name order-vision-upload-role-hv9lejlk \
    --policy-name CloudWatchMetricsPolicy \
    --policy-document file://cloudwatch-permissions-policy.json \
    --profile bio-rad-dev
```

## CloudWatch Permissions Policy (cloudwatch-permissions-policy.json)
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "cloudwatch:PutMetricData"
            ],
            "Resource": "*"
        }
    ]
}
```

## Complete Role Permissions
After adding the CloudWatch policy, the role will have these permissions:
- Basic Lambda execution (logs:CreateLogGroup, logs:CreateLogStream, logs:PutLogEvents)
- S3 access (from existing upload function permissions)
- Secrets Manager access (from existing upload function permissions)
- CloudWatch metrics (cloudwatch:PutMetricData) - **NEW**

Trust entities:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": [
                    "lambda.amazonaws.com"
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
    --function-name cloudwatch-alerts \
    --handler index.handler \
    --zip-file fileb://cloudwatch-alerts.zip \
    --role arn:aws:iam::367995044692:role/service-role/order-vision-upload-role-1eyc60zh \
    --timeout 60 \
    --environment Variables="{ \
      REGION=us-east-2, \
      TEAMS_WEBHOOK_URL=https://defaultef0aebeb2af047a3b8ae5665f8a62d.11.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/a6dc1e7f0b5d4765a4e7dae94358e321/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=vbIVnOTnwbWzqpzKjxUnxHJNp2hAcxTNZQ86w5m_YBE \
    }" \
    --profile bio-rad-qa
```

## Update function
```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name cloudwatch-alerts \
    --zip-file fileb://cloudwatch-alerts.zip \
    --profile bio-rad-qa
```

# PROD

## Create function
```bash
aws lambda create-function \
    --runtime nodejs22.x \
    --function-name cloudwatch-alerts \
    --handler index.handler \
    --zip-file fileb://cloudwatch-alerts.zip \
    --role arn:aws:iam::954366782091:role/order-vision-upload-role-1eyc60zh \
    --timeout 60 \
    --environment Variables="{ \
      REGION=us-east-2, \
      TEAMS_WEBHOOK_URL=https://prod-26.westus.logic.azure.com:443/workflows/a6dc1e7f0b5d4765a4e7dae94358e321/triggers/manual/paths/invoke?api-version=2016-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=SvC97DKeKHhm57YerMpqXLG6IoQAhkPApVtqMwxsu0w \
    }" \
    --profile bio-rad-prod
```

## Update function
```bash
aws lambda update-function-code \
    --region us-east-2 \
    --function-name cloudwatch-alerts \
    --zip-file fileb://cloudwatch-alerts.zip \
    --profile bio-rad-prod
```

# API Gateway Integration

The function will be added to the lambda-auth API Gateway as a proxy with required authentication.

## Expected Request Format

### CloudWatch Alert (Default)
```json
{
  "lambda": "Order Vision",
  "environment": "Development", 
  "alarmName": "LambdaTimeout",
  "severity": "Medium",
  "message": "Lambda exceeded timeout threshold at 2025-09-22T16:54Z",
  "timestamp": "2025-09-22T16:54:00.000Z"
}
```

### Manual Alert (Programmatic)
```json
{
  "lambda": "Order Processing",
  "environment": "Development",
  "alertType": "manual",
  "alarmName": "Data Validation Error",
  "severity": "High",
  "message": "Invalid customer data detected during order processing - missing required fields",
  "timestamp": "2025-09-22T17:16:00.000Z"
}
```

### Field Descriptions
- **lambda** (required): Name of the lambda function or service
- **environment** (required): Environment (Development, QA, Production)
- **message** (required): Alert message describing the issue
- **alertType** (optional): "manual" for programmatic alerts, "cloudwatch" (default) for monitoring alerts
- **alarmName** (optional): Name of the alarm/alert (defaults based on alertType)
- **severity** (optional): "Low", "Medium", "High", "Critical" (default: "Medium")
- **timestamp** (optional): ISO timestamp (defaults to current time)

## Response Format
```json
{
  "message": "Alert processed successfully",
  "alertDetails": {
    "lambda": "Order Vision",
    "environment": "Development",
    "alarmName": "LambdaTimeout", 
    "severity": "Medium",
    "timestamp": "2025-09-22T16:54:00.000Z"
  }
}
```

# CloudWatch Alert API Call Flow

## Step 1 - Send Alert
### DEV Request
```bash
AUTHORIZATION_TOKEN=$(grep ^AUTHORIZATION_DEV= ../../.env | cut -d '=' -f2-)
curl --request POST -H "Authorization: EEEmoY9FshUl6j2Ec7mRTlP9t/h+p36T1fBptOM0aMQ=" -H "Content-Type: application/json" --data "@test-manual.json" https://dev.git-api.bio-rad.com/cloudwatch-alerts > API-response.json
```

### QA Request
```bash
AUTHORIZATION_TOKEN=$(grep ^AUTHORIZATION_QA= ../../.env | cut -d '=' -f2-)
curl --request POST -H "Authorization: $AUTHORIZATION_TOKEN" -H "Content-Type: application/json" --data "@test.json" https://ueeobeir1a.execute-api.us-east-2.amazonaws.com/qa/cloudwatch-alerts > API-response.json
```

### PROD Request
```bash
AUTHORIZATION_TOKEN=$(grep ^AUTHORIZATION_PROD= ../../.env | cut -d '=' -f2-)
curl --request POST -H "Authorization: $AUTHORIZATION_TOKEN" -H "Content-Type: application/json" --data "@test.json" https://sa9xvletpi.execute-api.us-east-2.amazonaws.com/prod/cloudwatch-alerts > API-response.json
```

## Alert Types

### CloudWatch Alerts
- Triggered by AWS CloudWatch alarms and monitoring
- Uses default alertType of "cloudwatch"
- Shows "🚨 CloudWatch Alert Triggered" in Teams
- Typically used for infrastructure monitoring

### Manual Alerts
- Triggered programmatically from within lambda functions
- Uses alertType of "manual"
- Shows "📢 Manual Alert Triggered" in Teams
- Used for business logic alerts, validation errors, etc.

## Programmatic Usage

To trigger manual alerts from within your lambda functions, make an HTTP POST request to the alerts endpoint:

### Node.js Example
```javascript
import https from 'https';

async function sendManualAlert(alertData) {
  const payload = JSON.stringify({
    lambda: "Order Processing",
    environment: process.env.ENVIRONMENT || "Development",
    alertType: "manual",
    alarmName: "Business Logic Error",
    severity: "High",
    message: alertData.message,
    timestamp: new Date().toISOString()
  });

  const options = {
    hostname: 'b0jziam8t1.execute-api.us-east-2.amazonaws.com',
    port: 443,
    path: '/dev/cloudwatch-alerts',
    method: 'POST',
    headers: {
      'Authorization': process.env.AUTHORIZATION_TOKEN,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Alert failed: ${res.statusCode}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Usage in your lambda function
export const handler = async (event) => {
  try {
    // Your business logic here
    const result = await processOrder(event);
    
    if (result.hasErrors) {
      // Send manual alert for business logic issues
      await sendManualAlert({
        message: `Order processing failed: ${result.errors.join(', ')}`
      });
    }
    
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    // Send manual alert for critical errors
    await sendManualAlert({
      message: `Critical error in order processing: ${error.message}`
    });
    throw error;
  }
};
```

## Features

1. **Microsoft Teams Integration**: Sends formatted adaptive cards to Teams channels via webhook
2. **CloudWatch Metrics**: Logs custom metrics for alert tracking and monitoring
3. **Structured Logging**: Provides detailed logs for debugging and monitoring
4. **Error Handling**: Comprehensive error handling with appropriate HTTP status codes
5. **Flexible Input**: Accepts various alert formats and provides sensible defaults
6. **Dual Alert Types**: Supports both CloudWatch monitoring alerts and manual programmatic alerts

## Severity Levels
- **High/Critical**: Red color in Teams, high priority
- **Medium/Warning**: Yellow color in Teams, medium priority  
- **Low/Info**: Green color in Teams, low priority

## Custom Metrics
The function logs metrics to the `CustomAlerts/Lambda` namespace with dimensions:
- Lambda: The lambda function name
- Environment: The environment (dev/qa/prod)
- Severity: Alert severity level
- AlarmName: The specific alarm that triggered
