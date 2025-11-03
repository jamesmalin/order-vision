# Order Vision Tracking System

Complete audit trail and monitoring system for the Order Vision document processing pipeline.

## Overview

This tracking system provides comprehensive monitoring and alerting for the entire Order Vision workflow:
- **upload** → **upload-check** → **classification** → **start-processing** → **SAP integration**

## Architecture

### Components

1. **DynamoDB Table**: `order-vision-tracking-{env}` - Stores all tracking events
2. **SQS Queue**: `order-vision-tracking-queue-{env}` - Event processing queue
3. **Tracking Lambda**: `order-vision-tracking-{env}` - Processes tracking events
4. **Monitoring Lambda**: `order-vision-monitoring-{env}` - Monitors for issues and sends alerts

### Event Types

- `upload` - Initial metadata received and stored
- `upload_check` - File validation completed
- `classification` - Document classification completed
- `processing` - Individual file processing (per classified file)
- `sap_integration` - SAP posting completed
- `error` - Any failure in the pipeline
- `retry` - Retry attempts

### Event Status Values

- `started` - Event initiated
- `completed` - Event completed successfully
- `failed` - Event failed
- `retry` - Event being retried
- `timeout` - Event timed out

## Configuration

All thresholds are configurable via environment variables:

### Alert Timing Thresholds (minutes)
- `PROCESSING_TIMEOUT_WARNING`: 15
- `PROCESSING_TIMEOUT_CRITICAL`: 30
- `CLASSIFICATION_TIMEOUT`: 10
- `SAP_INTEGRATION_TIMEOUT`: 5

### Error Rate Thresholds (percentages)
- `ERROR_RATE_WARNING`: 5
- `ERROR_RATE_CRITICAL`: 10

### Queue Depth Thresholds (item counts)
- `QUEUE_DEPTH_WARNING`: 25
- `QUEUE_DEPTH_CRITICAL`: 50

### Retry Configuration
- `MAX_RETRIES`: 3
- `RETRY_DELAY_MINUTES`: 5

### Alert Controls
- `ALERT_BATCH_SIZE`: 10
- `ALERT_COOLDOWN_MINUTES`: 15
- `DAILY_SUMMARY_HOUR`: 8 (UTC)

### Data Retention (days)
- `SUCCESS_RECORD_TTL_DAYS`: 90
- `ERROR_RECORD_TTL_DAYS`: 365

## Deployment

### Prerequisites

1. Existing `cloudwatch-alerts` lambda function
2. AWS CLI configured with appropriate permissions
3. SAM CLI installed

### Quick Deployment (DEV Only)

```bash
cd lambda/tracking
./deploy.sh
```

For detailed deployment procedures and environment policies, see **[DEPLOY.md](DEPLOY.md)**.

### Manual Deployment Commands

```bash
# Deploy to DEV (recommended for development)
./deploy.sh dev us-east-2

# Deploy to QA (requires approval - see DEPLOY.md)
./deploy.sh qa us-east-2

# Deploy to PROD (requires formal approval - see DEPLOY.md)
./deploy.sh prod us-east-2
```

## Integration

### Sending Tracking Events

Other lambdas send tracking events via SQS:

```javascript
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const sqsClient = new SQSClient({ region: 'us-east-2' });

async function sendTrackingEvent(eventData) {
  const command = new SendMessageCommand({
    QueueUrl: process.env.TRACKING_QUEUE_URL,
    MessageBody: JSON.stringify(eventData)
  });
  
  await sqsClient.send(command);
}

// Example: Upload completed
await sendTrackingEvent({
  timestamp: 1759904600000,
  event_type: 'upload',
  status: 'completed',
  metadata: { /* email metadata */ },
  attachments: [ /* attachment list */ ]
});

// Example: Processing failed
await sendTrackingEvent({
  timestamp: 1759904600000,
  event_type: 'processing',
  status: 'failed',
  file_key: '/uploads/1759904600000/document.pdf',
  error_details: {
    message: 'Classification timeout',
    code: 'TIMEOUT',
    stack: error.stack
  },
  retry_count: 1
});
```

### Event Data Schema

```javascript
{
  // Required fields
  timestamp: Number,           // Upload timestamp (partition key)
  event_type: String,         // Event type (sort key)
  
  // Optional fields
  status: String,             // started|completed|failed|retry|timeout
  metadata: Object,           // Original email metadata
  attachments: Array,         // Attachment list with classifications
  error_details: {
    message: String,
    code: String,
    stack: String
  },
  retry_count: Number,
  processing_duration: Number, // Milliseconds
  sap_response: Object,       // SAP integration response
  file_key: String,          // S3 file key for individual files
  classification_result: Object // Classification results
}
```

## Monitoring & Alerts

### Alert Types

**Critical Alerts (High Severity)**
- Files stuck in processing > 30 minutes
- SAP integration failures
- Multiple retry failures (>3 attempts)
- Error rate > 10%

**Warning Alerts (Medium Severity)**
- Files stuck in processing > 15 minutes
- Individual file processing failures
- Error rate > 5%
- Queue depth > 25 items

**Info Alerts (Low Severity)**
- Daily processing summaries

### Alert Destinations

Alerts are sent via the existing `cloudwatch-alerts` lambda to:
- Microsoft Teams channels
- CloudWatch Logs
- CloudWatch Metrics

### Monitoring Schedule

- **Every 5 minutes**: Check for stuck items, error rates, queue depth
- **Daily at 8 AM UTC**: Send processing summary

## Querying Data

### Get Processing Timeline

```javascript
// Via tracking lambda
await sendTrackingEvent({
  action: 'get_timeline',
  timestamp: 1759904600000
});
```

### Direct DynamoDB Queries

```javascript
// Get all events for a timestamp
const params = {
  TableName: 'order-vision-tracking-dev',
  KeyConditionExpression: '#timestamp = :timestamp',
  ExpressionAttributeNames: { '#timestamp': 'timestamp' },
  ExpressionAttributeValues: { ':timestamp': 1759904600000 }
};

// Get failed items
const params = {
  TableName: 'order-vision-tracking-dev',
  IndexName: 'status-timestamp-index',
  KeyConditionExpression: '#status = :status',
  ExpressionAttributeNames: { '#status': 'status' },
  ExpressionAttributeValues: { ':status': 'failed' }
};
```

## Troubleshooting

### Common Issues

1. **Missing tracking events**: Check SQS queue for messages
2. **Alert spam**: Adjust `ALERT_COOLDOWN_MINUTES`
3. **High DynamoDB costs**: Review TTL settings
4. **Monitoring lambda timeouts**: Increase timeout or optimize queries

### Logs

- Tracking Lambda: `/aws/lambda/order-vision-tracking-{env}`
- Monitoring Lambda: `/aws/lambda/order-vision-monitoring-{env}`

### Metrics

Custom CloudWatch metrics under `CustomAlerts/Lambda` namespace:
- `AlertCount` by Lambda, Environment, Severity, AlarmName

## Development

### Local Testing

```bash
# Test tracking lambda
sam local invoke TrackingFunction -e test-events/upload-event.json

# Test monitoring lambda
sam local invoke MonitoringFunction -e test-events/monitoring-event.json
```

### End-to-End Testing

For comprehensive testing procedures, see **[TESTING.md](TESTING.md)** which includes:
- Unit testing procedures
- End-to-end pipeline testing with real uploads
- Monitoring and validation checklists
- Troubleshooting guides
- Performance testing

### Quick Test Commands

```bash
# Deploy and test in DEV
./deploy.sh dev

# Run end-to-end test (see TESTING.md for details)
curl --request POST \
  -H "Authorization: $AUTHORIZATION_TOKEN" \
  -H "Content-Type: application/json" \
  --data "@test-upload.json" \
  https://dev.git-api.bio-rad.com/order-vision/upload

# Monitor tracking events
aws dynamodb scan --table-name order-vision-tracking-dev --profile bio-rad-dev
```

### Adding New Event Types

1. Update event type constants in tracking lambda
2. Add specific alert logic in `handleEventAlerts()`
3. Update monitoring queries if needed
4. Update documentation

## Security

- All functions use least-privilege IAM roles
- SQS queues have dead letter queues for failed messages
- DynamoDB has encryption at rest enabled
- CloudWatch logs retention configured

## Cost Optimization

- DynamoDB uses on-demand billing
- TTL automatically deletes old records
- SQS messages have 14-day retention
- Lambda functions use ARM64 for cost savings (optional)
