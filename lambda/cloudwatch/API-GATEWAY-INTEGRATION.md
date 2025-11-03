# API Gateway Integration for CloudWatch Alerts Lambda

## Overview
The CloudWatch Alerts Lambda function needs to be integrated into the existing lambda-auth API Gateway to provide authenticated access.

## Integration Steps

### 1. Add Resource to API Gateway
The function should be added as a new resource under the existing API Gateway:
- **Path**: `/cloudwatch-alerts`
- **Method**: `POST`
- **Integration Type**: Lambda Proxy Integration
- **Lambda Function**: `cloudwatch-alerts`
- **Authorization**: Required (using existing lambda-auth authorizer)

### 2. API Gateway Configuration
Based on the existing pattern from the upload function, the configuration should be:

```json
{
  "resource": "/cloudwatch-alerts",
  "httpMethod": "POST",
  "authorizationType": "CUSTOM",
  "authorizerId": "existing-lambda-auth-authorizer-id",
  "integration": {
    "type": "AWS_PROXY",
    "httpMethod": "POST",
    "uri": "arn:aws:apigateway:us-east-2:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-2:614250372661:function:cloudwatch-alerts/invocations"
  }
}
```

### 3. Lambda Permissions
Add permission for API Gateway to invoke the lambda:

```bash
# DEV Environment
aws lambda add-permission \
    --function-name cloudwatch-alerts \
    --statement-id apigateway-invoke-cloudwatch-alerts \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:us-east-2:614250372661:b0jziam8t1/*/POST/cloudwatch-alerts" \
    --profile bio-rad-dev
```

## Expected API Endpoints

### DEV Environment
```
POST https://b0jziam8t1.execute-api.us-east-2.amazonaws.com/dev/cloudwatch-alerts
```

### QA Environment  
```
POST https://ueeobeir1a.execute-api.us-east-2.amazonaws.com/qa/cloudwatch-alerts
```

### PROD Environment
```
POST https://sa9xvletpi.execute-api.us-east-2.amazonaws.com/prod/cloudwatch-alerts
```

## Example Usage

### DEV Request
```bash
AUTHORIZATION_TOKEN=$(grep ^AUTHORIZATION_DEV= ../../.env | cut -d '=' -f2-)
curl --request POST \
  -H "Authorization: $AUTHORIZATION_TOKEN" \
  -H "Content-Type: application/json" \
  --data "@test.json" \
  https://b0jziam8t1.execute-api.us-east-2.amazonaws.com/dev/cloudwatch-alerts > API-response.json
```

### QA Request
```bash
AUTHORIZATION_TOKEN=$(grep ^AUTHORIZATION_QA= ../../.env | cut -d '=' -f2-)
curl --request POST \
  -H "Authorization: $AUTHORIZATION_TOKEN" \
  -H "Content-Type: application/json" \
  --data "@test.json" \
  https://ueeobeir1a.execute-api.us-east-2.amazonaws.com/qa/cloudwatch-alerts > API-response.json
```

### PROD Request
```bash
AUTHORIZATION_TOKEN=$(grep ^AUTHORIZATION_PROD= ../../.env | cut -d '=' -f2-)
curl --request POST \
  -H "Authorization: $AUTHORIZATION_TOKEN" \
  -H "Content-Type: application/json" \
  --data "@test.json" \
  https://sa9xvletpi.execute-api.us-east-2.amazonaws.com/prod/cloudwatch-alerts > API-response.json
```

## Request Format
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

## Response Format
### Success (200)
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

### Error (400)
```json
{
  "message": "Missing required fields: lambda, environment, and message are required"
}
```

### Error (500)
```json
{
  "message": "Error processing alert",
  "error": "Detailed error message"
}
```

## Security
- All requests require valid authorization token
- Uses the same authentication mechanism as other lambda functions
- Tokens are environment-specific (DEV/QA/PROD)

## Monitoring
- Function logs are available in CloudWatch Logs: `/aws/lambda/cloudwatch-alerts`
- Custom metrics are logged to CloudWatch (if permissions are added)
- Teams notifications are sent if webhook URL is configured

## Next Steps
1. Contact AWS administrator to add CloudWatch permissions to the role
2. Add the function to the API Gateway configuration
3. Test the API Gateway integration
4. Deploy to QA and PROD environments
