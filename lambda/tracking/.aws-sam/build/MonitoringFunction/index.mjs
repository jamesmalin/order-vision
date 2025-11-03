import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const REGION = process.env.AWS_REGION || 'us-east-2';
const TRACKING_TABLE = process.env.TRACKING_TABLE;
const TRACKING_QUEUE_URL = process.env.TRACKING_QUEUE_URL;
const ENVIRONMENT = process.env.ENVIRONMENT || 'dev';

// Environment variables for thresholds
const PROCESSING_TIMEOUT_WARNING = parseInt(process.env.PROCESSING_TIMEOUT_WARNING) || 15;
const PROCESSING_TIMEOUT_CRITICAL = parseInt(process.env.PROCESSING_TIMEOUT_CRITICAL) || 30;
const CLASSIFICATION_TIMEOUT = parseInt(process.env.CLASSIFICATION_TIMEOUT) || 10;
const SAP_INTEGRATION_TIMEOUT = parseInt(process.env.SAP_INTEGRATION_TIMEOUT) || 5;
const ERROR_RATE_WARNING = parseInt(process.env.ERROR_RATE_WARNING) || 5;
const ERROR_RATE_CRITICAL = parseInt(process.env.ERROR_RATE_CRITICAL) || 10;
const QUEUE_DEPTH_WARNING = parseInt(process.env.QUEUE_DEPTH_WARNING) || 25;
const QUEUE_DEPTH_CRITICAL = parseInt(process.env.QUEUE_DEPTH_CRITICAL) || 50;
const ALERT_COOLDOWN_MINUTES = parseInt(process.env.ALERT_COOLDOWN_MINUTES) || 15;

const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const lambdaClient = new LambdaClient({ region: REGION });
const sqsClient = new SQSClient({ region: REGION });

// In-memory cache for alert cooldowns (in production, consider using DynamoDB or ElastiCache)
const alertCooldowns = new Map();

/**
 * Send alert using existing cloudwatch-alerts lambda
 */
async function sendAlert(alertData) {
  // Check cooldown
  const alertKey = `${alertData.alarmName}-${alertData.severity}`;
  const now = Date.now();
  const cooldownUntil = alertCooldowns.get(alertKey);
  
  if (cooldownUntil && now < cooldownUntil) {
    console.log(`Alert ${alertKey} is in cooldown until ${new Date(cooldownUntil)}`);
    return;
  }

  const payload = {
    lambda: 'Order Vision Monitoring',
    environment: ENVIRONMENT,
    alertType: 'manual',
    alarmName: alertData.alarmName,
    severity: alertData.severity || 'Medium',
    message: alertData.message,
    timestamp: new Date().toISOString()
  };

  try {
    const command = new InvokeCommand({
      FunctionName: `cloudwatch-alerts-${ENVIRONMENT}`,
      InvocationType: 'Event',
      Payload: JSON.stringify(payload)
    });

    await lambdaClient.send(command);
    console.log('Alert sent successfully:', alertData.message);
    
    // Set cooldown
    alertCooldowns.set(alertKey, now + (ALERT_COOLDOWN_MINUTES * 60 * 1000));
  } catch (error) {
    console.error('Error sending alert:', error);
  }
}

/**
 * Get stuck processing items
 */
async function getStuckProcessingItems() {
  const now = Date.now();
  const warningThreshold = now - (PROCESSING_TIMEOUT_WARNING * 60 * 1000);
  const criticalThreshold = now - (PROCESSING_TIMEOUT_CRITICAL * 60 * 1000);

  // Query for items with status 'started' or 'processing'
  const queryCommand = new QueryCommand({
    TableName: TRACKING_TABLE,
    IndexName: 'status-timestamp-index',
    KeyConditionExpression: '#status = :status',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': 'started'
    }
  });

  const result = await docClient.send(queryCommand);
  const stuckItems = [];

  for (const item of result.Items || []) {
    const eventTime = new Date(item.event_timestamp).getTime();
    const duration = now - eventTime;
    const durationMinutes = duration / (1000 * 60);

    if (eventTime < criticalThreshold) {
      stuckItems.push({
        ...item,
        duration: durationMinutes,
        severity: 'Critical'
      });
    } else if (eventTime < warningThreshold) {
      stuckItems.push({
        ...item,
        duration: durationMinutes,
        severity: 'Warning'
      });
    }
  }

  return stuckItems;
}

/**
 * Get failed items that need attention
 */
async function getFailedItems() {
  const queryCommand = new QueryCommand({
    TableName: TRACKING_TABLE,
    IndexName: 'status-timestamp-index',
    KeyConditionExpression: '#status = :status',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': 'failed'
    },
    ScanIndexForward: false, // Get most recent first
    Limit: 50
  });

  const result = await docClient.send(queryCommand);
  return result.Items || [];
}

/**
 * Calculate error rates for the last hour
 */
async function calculateErrorRates() {
  const oneHourAgo = new Date(Date.now() - (60 * 60 * 1000)).toISOString();
  
  // This is a simplified approach - in production, you might want to use CloudWatch metrics
  const scanCommand = new ScanCommand({
    TableName: TRACKING_TABLE,
    FilterExpression: '#event_timestamp > :oneHourAgo',
    ExpressionAttributeNames: {
      '#event_timestamp': 'event_timestamp'
    },
    ExpressionAttributeValues: {
      ':oneHourAgo': oneHourAgo
    }
  });

  const result = await docClient.send(scanCommand);
  const items = result.Items || [];
  
  const total = items.length;
  const failed = items.filter(item => item.status === 'failed' || item.status === 'error').length;
  
  const errorRate = total > 0 ? (failed / total) * 100 : 0;
  
  return {
    total,
    failed,
    errorRate: Math.round(errorRate * 100) / 100
  };
}

/**
 * Get processing queue depth (items waiting to be processed)
 */
async function getQueueDepth() {
  const queryCommand = new QueryCommand({
    TableName: TRACKING_TABLE,
    IndexName: 'status-timestamp-index',
    KeyConditionExpression: '#status = :status',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': 'started'
    },
    Select: 'COUNT'
  });

  const result = await docClient.send(queryCommand);
  return result.Count || 0;
}

/**
 * Generate daily summary
 */
async function generateDailySummary() {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const scanCommand = new ScanCommand({
    TableName: TRACKING_TABLE,
    FilterExpression: '#event_timestamp BETWEEN :start AND :end',
    ExpressionAttributeNames: {
      '#event_timestamp': 'event_timestamp'
    },
    ExpressionAttributeValues: {
      ':start': yesterday.toISOString(),
      ':end': today.toISOString()
    }
  });

  const result = await docClient.send(scanCommand);
  const items = result.Items || [];

  // Group by timestamp to count unique uploads
  const uploads = new Set();
  const completed = new Set();
  const failed = new Set();
  let totalProcessingTime = 0;
  let processedCount = 0;

  items.forEach(item => {
    uploads.add(item.timestamp);
    
    if (item.event_type === 'sap_delivery' && item.status === 'completed') {
      completed.add(item.timestamp);
    }
    
    if (item.status === 'failed' || item.status === 'error') {
      failed.add(item.timestamp);
    }
    
    if (item.processing_duration) {
      totalProcessingTime += item.processing_duration;
      processedCount++;
    }
  });

  const avgProcessingTime = processedCount > 0 ? totalProcessingTime / processedCount : 0;
  const avgProcessingMinutes = Math.round((avgProcessingTime / (1000 * 60)) * 10) / 10;
  const errorRate = uploads.size > 0 ? Math.round((failed.size / uploads.size) * 100 * 10) / 10 : 0;

  return {
    date: yesterday.toISOString().split('T')[0],
    totalUploads: uploads.size,
    completed: completed.size,
    failed: failed.size,
    avgProcessingMinutes,
    errorRate
  };
}

/**
 * Check for stuck items and send alerts
 */
async function checkStuckItems() {
  const stuckItems = await getStuckProcessingItems();
  
  for (const item of stuckItems) {
    const severity = item.severity === 'Critical' ? 'High' : 'Medium';
    const message = `Processing stuck for ${item.duration.toFixed(1)} minutes. Timestamp: ${item.timestamp}, Event: ${item.event_type}`;
    
    await sendAlert({
      alarmName: `Processing Stuck ${item.severity}`,
      severity,
      message
    });
  }

  return stuckItems.length;
}

/**
 * Check error rates and send alerts
 */
async function checkErrorRates() {
  const errorStats = await calculateErrorRates();
  
  if (errorStats.errorRate >= ERROR_RATE_CRITICAL) {
    await sendAlert({
      alarmName: 'Error Rate Critical',
      severity: 'High',
      message: `Error rate is ${errorStats.errorRate}% (${errorStats.failed}/${errorStats.total} in last hour)`
    });
  } else if (errorStats.errorRate >= ERROR_RATE_WARNING) {
    await sendAlert({
      alarmName: 'Error Rate Warning',
      severity: 'Medium',
      message: `Error rate is ${errorStats.errorRate}% (${errorStats.failed}/${errorStats.total} in last hour)`
    });
  }

  return errorStats;
}

/**
 * Check queue depth and send alerts
 */
async function checkQueueDepth() {
  const queueDepth = await getQueueDepth();
  
  if (queueDepth >= QUEUE_DEPTH_CRITICAL) {
    await sendAlert({
      alarmName: 'Queue Depth Critical',
      severity: 'High',
      message: `Processing queue depth is ${queueDepth} items (threshold: ${QUEUE_DEPTH_CRITICAL})`
    });
  } else if (queueDepth >= QUEUE_DEPTH_WARNING) {
    await sendAlert({
      alarmName: 'Queue Depth Warning',
      severity: 'Medium',
      message: `Processing queue depth is ${queueDepth} items (threshold: ${QUEUE_DEPTH_WARNING})`
    });
  }

  return queueDepth;
}

/**
 * Send daily summary alert
 */
async function sendDailySummary() {
  const summary = await generateDailySummary();
  
  const message = `Daily Order Vision Summary (${summary.date}):
• Total uploads: ${summary.totalUploads}
• Completed: ${summary.completed}
• Failed: ${summary.failed}
• Average processing time: ${summary.avgProcessingMinutes} minutes
• Error rate: ${summary.errorRate}%`;

  await sendAlert({
    alarmName: 'Daily Processing Summary',
    severity: 'Low',
    message
  });

  return summary;
}

/**
 * Main Lambda handler
 */
export const handler = async (event) => {
  console.log('Monitoring Lambda triggered:', JSON.stringify(event, null, 2));

  try {
    const results = {};

    // Check if this is a daily summary request
    if (event.type === 'daily_summary') {
      console.log('Generating daily summary...');
      results.dailySummary = await sendDailySummary();
      
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Daily summary generated successfully',
          results
        })
      };
    }

    // Regular monitoring checks
    console.log('Running monitoring checks...');
    
    // Check for stuck processing items
    results.stuckItemsCount = await checkStuckItems();
    
    // Check error rates
    results.errorStats = await checkErrorRates();
    
    // Check queue depth
    results.queueDepth = await checkQueueDepth();
    
    // Get recent failed items for logging
    const failedItems = await getFailedItems();
    results.recentFailures = failedItems.slice(0, 5).map(item => ({
      timestamp: item.timestamp,
      event_type: item.event_type,
      error: item.error_details?.message || 'Unknown error'
    }));

    console.log('Monitoring results:', JSON.stringify(results, null, 2));

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Monitoring checks completed successfully',
        results
      })
    };

  } catch (error) {
    console.error('Error in monitoring lambda:', error);
    
    await sendAlert({
      alarmName: 'Monitoring Lambda Error',
      severity: 'High',
      message: `Monitoring lambda failed: ${error.message}`
    });

    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error in monitoring checks',
        error: error.message
      })
    };
  }
};
