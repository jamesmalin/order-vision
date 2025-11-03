import https from 'https';
import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';

const REGION = process.env.REGION || 'us-east-2';
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL;

const cloudWatchClient = new CloudWatchClient({ region: REGION });

export const handler = async (event) => {
  console.log('CloudWatch Alert Lambda triggered:', JSON.stringify(event, null, 2));
  
  let body;
  try {
    // Parse the incoming event
    if (event.body) {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } else {
      body = typeof event === 'string' ? JSON.parse(event) : event;
    }
  } catch (error) {
    console.error("Error parsing event body:", error);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid JSON format" }),
    };
  }

  // Extract alert information
  const {
    lambda,
    environment,
    message,
    alarmName,
    severity,
    timestamp,
    alertType
  } = body;

  // Validate required fields
  if (!lambda || !environment || !message) {
    return {
      statusCode: 400,
      body: JSON.stringify({ 
        message: "Missing required fields: lambda, environment, and message are required" 
      }),
    };
  }

  // Set defaults for optional fields
  const alertData = {
    lambda,
    environment,
    message,
    alarmName: alarmName || (alertType === 'manual' ? 'Manual Alert' : 'Unknown Alarm'),
    severity: severity || 'Medium',
    timestamp: timestamp || new Date().toISOString(),
    alertType: alertType || 'cloudwatch'
  };

  try {
    // Send alert to Teams if webhook URL is configured
    if (TEAMS_WEBHOOK_URL) {
      await sendTeamsAlert(alertData);
    }

    // Log custom metric to CloudWatch (optional - will not fail if no permissions)
    try {
      await logMetricToCloudWatch(alertData);
    } catch (metricError) {
      console.warn('Could not log metric to CloudWatch (permissions may be missing):', metricError.message);
    }

    // Log the alert for CloudWatch Logs
    console.log(`ALERT: [${alertData.severity}] ${alertData.lambda} (${alertData.environment}) - ${alertData.alarmName}: ${alertData.message}`);

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        message: "Alert processed successfully",
        alertDetails: {
          lambda: alertData.lambda,
          environment: alertData.environment,
          alarmName: alertData.alarmName,
          severity: alertData.severity,
          timestamp: alertData.timestamp
        }
      }),
    };

  } catch (error) {
    console.error('Error processing alert:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        message: "Error processing alert",
        error: error.message 
      }),
    };
  }
};

async function sendTeamsAlert(alertData) {
  const { lambda, environment, message, alarmName, severity, timestamp } = alertData;
  
  // Send simple JSON payload directly to Teams (same format as curl example)
  const teamsPayload = {
    lambda,
    environment,
    alarmName,
    severity,
    message
  };

  return new Promise((resolve, reject) => {
    const url = new URL(TEAMS_WEBHOOK_URL);
    const postData = JSON.stringify(teamsPayload);

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log('Teams alert sent successfully');
          resolve(data);
        } else {
          console.error(`Teams webhook failed with status: ${res.statusCode}`);
          reject(new Error(`Teams webhook failed: ${res.statusCode}`));
        }
      });
    });

    req.on('error', (error) => {
      console.error('Error sending Teams alert:', error);
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

async function logMetricToCloudWatch(alertData) {
  const { lambda, environment, severity, alarmName } = alertData;
  
  const params = {
    Namespace: 'CustomAlerts/Lambda',
    MetricData: [
      {
        MetricName: 'AlertCount',
        Dimensions: [
          {
            Name: 'Lambda',
            Value: lambda
          },
          {
            Name: 'Environment',
            Value: environment
          },
          {
            Name: 'Severity',
            Value: severity
          },
          {
            Name: 'AlarmName',
            Value: alarmName
          }
        ],
        Value: 1,
        Unit: 'Count',
        Timestamp: new Date()
      }
    ]
  };

  try {
    const command = new PutMetricDataCommand(params);
    await cloudWatchClient.send(command);
    console.log('Custom metric logged to CloudWatch');
  } catch (error) {
    console.error('Error logging metric to CloudWatch:', error);
    throw error;
  }
}

function getSeverityColor(severity) {
  switch (severity.toLowerCase()) {
    case 'high':
    case 'critical':
      return 'attention';
    case 'medium':
    case 'warning':
      return 'warning';
    case 'low':
    case 'info':
      return 'good';
    default:
      return 'default';
  }
}
