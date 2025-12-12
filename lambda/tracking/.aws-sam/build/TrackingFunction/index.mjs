import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

const REGION = process.env.AWS_REGION || 'us-east-2';
const TRACKING_TABLE = process.env.TRACKING_TABLE;
const ENVIRONMENT = process.env.ENVIRONMENT || 'dev';

// Environment variables for thresholds
const SUCCESS_RECORD_TTL_DAYS = parseInt(process.env.SUCCESS_RECORD_TTL_DAYS) || 90;
const ERROR_RECORD_TTL_DAYS = parseInt(process.env.ERROR_RECORD_TTL_DAYS) || 365;

const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const lambdaClient = new LambdaClient({ region: REGION });

/**
 * Calculate TTL timestamp based on record type
 */
function calculateTTL(status) {
  const now = Math.floor(Date.now() / 1000);
  const days = status === 'failed' || status === 'error' ? ERROR_RECORD_TTL_DAYS : SUCCESS_RECORD_TTL_DAYS;
  return now + (days * 24 * 60 * 60);
}

/**
 * Send alert using existing cloudwatch-alerts lambda
 */
async function sendAlert(alertData) {
  const payload = {
    lambda: 'Order Vision Tracking',
    environment: ENVIRONMENT,
    alertType: 'manual',
    alarmName: alertData.alarmName || 'Tracking Alert',
    severity: alertData.severity || 'Medium',
    message: alertData.message,
    timestamp: new Date().toISOString()
  };

  try {
    const command = new InvokeCommand({
      FunctionName: `cloudwatch-alerts`,
      InvocationType: 'Event',
      Payload: JSON.stringify(payload)
    });

    await lambdaClient.send(command);
    console.log('Alert sent successfully:', alertData.message);
  } catch (error) {
    console.error('Error sending alert:', error);
    // Don't fail the main function if alert fails
  }
}

/**
 * Process a single tracking event
 */
async function processTrackingEvent(event) {
  const {
    timestamp,
    event_type,
    eventType,
    status,
    metadata,
    attachments,
    error_details,
    retry_count = 0,
    processing_duration,
    sap_response,
    file_key,
    classification_result
  } = event;

  // Support both event_type and eventType for backward compatibility
  const finalEventType = event_type || eventType;

  if (!timestamp || !finalEventType) {
    console.error('Validation failed:', { timestamp, event_type, eventType, finalEventType });
    throw new Error(`Missing required fields: timestamp=${timestamp}, event_type=${event_type}, eventType=${eventType}`);
  }

  const eventTimestamp = new Date().toISOString();
  const ttl = calculateTTL(status);

  // Base tracking record
  const trackingRecord = {
    timestamp: parseInt(timestamp),
    event_type: finalEventType,
    event_timestamp: eventTimestamp,
    status: status || 'started',
    ttl,
    retry_count,
    environment: ENVIRONMENT
  };

  // Add optional fields if present
  if (metadata) {
    trackingRecord.metadata = metadata;
    
    // Flatten key metadata fields for easier querying
    if (metadata.from) trackingRecord.from = metadata.from;
    if (metadata.subject) trackingRecord.subject = metadata.subject;
    if (metadata.emailId) trackingRecord.emailId = metadata.emailId;
    if (metadata.CreatedOn) trackingRecord.createdOn = metadata.CreatedOn;
  }
  if (attachments) trackingRecord.attachments = attachments;
  if (error_details) trackingRecord.error_details = error_details;
  if (processing_duration) trackingRecord.processing_duration = processing_duration;
  if (sap_response) trackingRecord.sap_response = sap_response;
  if (file_key) trackingRecord.file_key = file_key;
  if (classification_result) trackingRecord.classification_result = classification_result;

  // Store in DynamoDB
  const putCommand = new PutCommand({
    TableName: TRACKING_TABLE,
    Item: trackingRecord
  });

  await docClient.send(putCommand);

  console.log(`Tracking event stored: ${timestamp}-${finalEventType} (${status})`);

  // Send alerts for critical events
  await handleEventAlerts(trackingRecord);

  return trackingRecord;
}

/**
 * Handle alerts based on event type and status
 */
async function handleEventAlerts(record) {
  const { timestamp, event_type, status, error_details, retry_count, processing_duration } = record;

  // Alert on failures
  if (status === 'failed' || status === 'error') {
    const severity = retry_count >= 3 ? 'High' : 'Medium';
    const message = `${event_type} failed for timestamp ${timestamp}. ${error_details?.message || 'Unknown error'}. Retry count: ${retry_count}`;
    
    await sendAlert({
      alarmName: `${event_type} Failure`,
      severity,
      message
    });
  }

  // Alert on long processing times
  if (processing_duration && event_type === 'processing') {
    const durationMinutes = processing_duration / (1000 * 60);
    const warningThreshold = parseInt(process.env.PROCESSING_TIMEOUT_WARNING) || 15;
    const criticalThreshold = parseInt(process.env.PROCESSING_TIMEOUT_CRITICAL) || 30;

    if (durationMinutes > criticalThreshold) {
      await sendAlert({
        alarmName: 'Processing Timeout Critical',
        severity: 'High',
        message: `Processing taking ${durationMinutes.toFixed(1)} minutes for timestamp ${timestamp} (threshold: ${criticalThreshold}m)`
      });
    } else if (durationMinutes > warningThreshold) {
      await sendAlert({
        alarmName: 'Processing Timeout Warning',
        severity: 'Medium',
        message: `Processing taking ${durationMinutes.toFixed(1)} minutes for timestamp ${timestamp} (threshold: ${warningThreshold}m)`
      });
    }
  }

  // Alert on SAP delivery issues
  if (event_type === 'sap_delivery' && status === 'failed') {
    await sendAlert({
      alarmName: 'SAP Delivery Failure',
      severity: 'High',
      message: `SAP delivery failed for timestamp ${timestamp}. ${error_details?.message || 'Unknown SAP error'}`
    });
  }
}

/**
 * Update existing tracking record
 */
async function updateTrackingRecord(timestamp, eventType, updates) {
  const updateExpression = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  Object.keys(updates).forEach((key, index) => {
    const attrName = `#attr${index}`;
    const attrValue = `:val${index}`;
    
    updateExpression.push(`${attrName} = ${attrValue}`);
    expressionAttributeNames[attrName] = key;
    expressionAttributeValues[attrValue] = updates[key];
  });

  // Always update the event timestamp and TTL
  updateExpression.push('#eventTimestamp = :eventTimestamp');
  updateExpression.push('#ttl = :ttl');
  expressionAttributeNames['#eventTimestamp'] = 'event_timestamp';
  expressionAttributeNames['#ttl'] = 'ttl';
  expressionAttributeValues[':eventTimestamp'] = new Date().toISOString();
  expressionAttributeValues[':ttl'] = calculateTTL(updates.status);

  const updateCommand = new UpdateCommand({
    TableName: TRACKING_TABLE,
    Key: {
      timestamp: parseInt(timestamp),
      event_type: eventType
    },
    UpdateExpression: `SET ${updateExpression.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  });

  const result = await docClient.send(updateCommand);
  console.log(`Updated tracking record: ${timestamp}-${eventType}`);
  
  return result.Attributes;
}

/**
 * Get processing timeline for a timestamp
 */
async function getProcessingTimeline(timestamp) {
  const queryCommand = new QueryCommand({
    TableName: TRACKING_TABLE,
    KeyConditionExpression: '#timestamp = :timestamp',
    ExpressionAttributeNames: {
      '#timestamp': 'timestamp'
    },
    ExpressionAttributeValues: {
      ':timestamp': parseInt(timestamp)
    },
    ScanIndexForward: true
  });

  const result = await docClient.send(queryCommand);
  return result.Items || [];
}

/**
 * Main Lambda handler
 */
export const handler = async (event) => {
  console.log('Tracking Lambda triggered:', JSON.stringify(event, null, 2));

  const results = [];
  const errors = [];

  try {
    // Process SQS records
    if (event.Records) {
      for (const record of event.Records) {
        try {
          const trackingEvent = JSON.parse(record.body);
          
          // Handle different event types
          if (trackingEvent.action === 'update') {
            const updated = await updateTrackingRecord(
              trackingEvent.timestamp,
              trackingEvent.event_type,
              trackingEvent.updates
            );
            results.push(updated);
          } else if (trackingEvent.action === 'get_timeline') {
            const timeline = await getProcessingTimeline(trackingEvent.timestamp);
            results.push({ timestamp: trackingEvent.timestamp, timeline });
          } else {
            // Default: create new tracking record
            const processed = await processTrackingEvent(trackingEvent);
            results.push(processed);
          }
        } catch (error) {
          console.error('Error processing record:', error);
          errors.push({
            record: record.body,
            error: error.message
          });
        }
      }
    } else {
      // Direct invocation (for testing)
      const processed = await processTrackingEvent(event);
      results.push(processed);
    }

    // Send summary alert if there were errors
    if (errors.length > 0) {
      await sendAlert({
        alarmName: 'Tracking Processing Errors',
        severity: 'Medium',
        message: `${errors.length} tracking events failed to process. First error: ${errors[0].error}`
      });
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Tracking events processed successfully',
        processed: results.length,
        errors: errors.length,
        results: results.slice(0, 5), // Limit response size
        errors: errors.slice(0, 3)
      })
    };

  } catch (error) {
    console.error('Critical error in tracking lambda:', error);
    
    await sendAlert({
      alarmName: 'Tracking Lambda Critical Error',
      severity: 'High',
      message: `Critical error in tracking lambda: ${error.message}`
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error processing tracking events',
        error: error.message
      })
    };
  }
};
