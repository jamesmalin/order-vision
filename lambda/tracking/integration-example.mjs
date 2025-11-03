/**
 * Example Integration: Upload Lambda with Tracking
 * 
 * This shows how to modify the existing upload lambda to integrate
 * with the tracking system. Copy the relevant parts to your actual
 * lambda functions.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { normalizeEmailObject } from './email-utils.mjs';

// Import tracking utilities
import { 
  trackUploadStarted, 
  trackUploadCompleted, 
  trackError,
  extractTimestamp,
  startTimer 
} from '../tracking/tracking-utils.mjs';

import dotenv from 'dotenv';
dotenv.config();

const BUCKET_NAME = process.env.BUCKET_NAME || 'order-vision-ai-dev';
const REGION = process.env.REGION || 'us-east-2';

const s3Client = new S3Client({ region: REGION });
const lambdaClient = new LambdaClient({ region: REGION });

// Function to send alert to CloudWatch alerts Lambda using direct Lambda invocation
async function sendAlert(alertData) {
  const environment = process.env.ENVIRONMENT || 'Development';
  
  const payload = {
    lambda: 'Order Vision Upload',
    environment: environment,
    alertType: 'manual',
    alarmName: 'Validation Error',
    severity: 'Medium',
    message: alertData.message,
    timestamp: new Date().toISOString()
  };

  try {
    const command = new InvokeCommand({
      FunctionName: 'cloudwatch-alerts',
      InvocationType: 'Event',
      Payload: JSON.stringify(payload)
    });

    await lambdaClient.send(command);
    console.log('Alert sent successfully to cloudwatch-alerts lambda');
  } catch (error) {
    console.error('Error sending alert to cloudwatch-alerts lambda:', error);
  }
}

export const handler = async (event) => {
  console.log(event);
  
  // Start timing for performance tracking
  const getProcessingDuration = startTimer();
  
  let body;
  let timestamp;
  let metadata;
  
  try {
    // Parse the incoming event
    if (event.body) {
      body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } else {
      body = typeof event === 'string' ? JSON.parse(event) : event;
    }
  } catch (error) {
    console.error("Error parsing event body:", error);
    throw new Error("Invalid JSON format");
  }

  try {
    // Get month and year from system date
    const date = new Date();
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const currentYearMonth = `${year}-${month}`;

    // Normalize the email object to ensure To and Cc are arrays
    const normalizedBody = normalizeEmailObject(body);
    
    let {
      CreatedOn,
      EmailId,
      Subject,
      From,
      To,
      Cc,
      Body,
      Attachments
    } = normalizedBody;

    // Extract timestamp for tracking
    timestamp = extractTimestamp(normalizedBody);
    metadata = normalizedBody;

    // 🔥 TRACKING: Send upload started event
    await trackUploadStarted(timestamp, metadata, Attachments);

    // Validation checks
    if (!Array.isArray(Attachments) || Attachments.length === 0) {
      const error = new Error('Attachments must be a non-empty array of objects');
      
      // 🔥 TRACKING: Send error event
      await trackError(timestamp, 'upload', error);
      
      await sendAlert({
        message: `Upload validation failed: Attachments must be a non-empty array of objects. EmailId: ${EmailId || 'Unknown'}, Subject: ${Subject || 'Unknown'}`
      });
      
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'Attachments must be a non-empty array of objects' }),
      };
    }

    if (!CreatedOn) {
      const error = new Error('CreatedOn is required');
      
      // 🔥 TRACKING: Send error event
      await trackError(timestamp, 'upload', error);
      
      await sendAlert({
        message: `Upload validation failed: CreatedOn is required. EmailId: ${EmailId || 'Unknown'}, Subject: ${Subject || 'Unknown'}`
      });
      
      return {
        statusCode: 400,
        body: JSON.stringify({ message: 'CreatedOn is required' }),
      };
    }

    // Create timestamp-based folder name
    const baseDir = `uploads/${timestamp}`;
    
    // Generate pre-signed URLs for each file
    const urls = await Promise.all(
      Attachments.map(async (file) => {
        const fileKey = `${baseDir}/${file.AttachmentName}`;

        const command = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: fileKey,
          ContentType: 'application/octet-stream',
        });

        const url = await getSignedUrl(s3Client, command, { expiresIn: 300 });

        return { FileName: file.AttachmentName, Url: url, FileKey: fileKey };
      })
    );

    const finalMetadata = {
      CreatedOn,
      EmailId,
      Subject,
      From,
      To,
      Cc,
      Body,
      Attachments
    };

    // Upload the metadata JSON file
    const metadataKey = `${baseDir}/metadata.json`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: metadataKey,
        Body: JSON.stringify(finalMetadata),
        ContentType: 'application/json',
      })
    );

    // Upload copy of the metadata JSON file to the root directory
    const rootMetadataKey = `${timestamp}.json`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: rootMetadataKey,
        Body: JSON.stringify(finalMetadata),
        ContentType: 'application/json',
        Tagging: 'AllowDelete=true'
      })
    );

    // 🔥 TRACKING: Send upload completed event
    const processingDuration = getProcessingDuration();
    await trackUploadCompleted(timestamp, finalMetadata, Attachments);

    console.log(urls);

    return {
      statusCode: 200,
      body: urls,
    };

  } catch (error) {
    console.error('Error in upload handler:', error);
    
    // 🔥 TRACKING: Send error event if we have timestamp
    if (timestamp) {
      await trackError(timestamp, 'upload', error);
    }
    
    // Send alert for critical errors
    await sendAlert({
      message: `Upload handler critical error: ${error.message}. EmailId: ${metadata?.EmailId || 'Unknown'}`
    });

    return {
      statusCode: 500,
      body: JSON.stringify({ 
        message: 'Internal server error',
        error: error.message 
      }),
    };
  }
};

/**
 * Integration Steps for Existing Lambdas:
 * 
 * 1. Add tracking-utils.mjs to your lambda package
 * 2. Add @aws-sdk/client-sqs to package.json dependencies
 * 3. Add TRACKING_QUEUE_URL environment variable
 * 4. Import tracking functions at the top of your lambda
 * 5. Add tracking calls at key points:
 *    - Start of processing: trackXxxStarted()
 *    - End of processing: trackXxxCompleted()
 *    - On errors: trackError() or trackXxxFailed()
 * 6. Use extractTimestamp() to get consistent timestamps
 * 7. Use startTimer() to measure processing duration
 * 
 * Key Integration Points:
 * 
 * Upload Lambda:
 * - trackUploadStarted() at beginning
 * - trackUploadCompleted() on success
 * - trackError() on validation failures
 * 
 * Upload-Check Lambda:
 * - trackUploadCheckStarted() when checking files
 * - trackUploadCheckCompleted() when all files validated
 * - trackUploadCheckFailed() when files missing
 * 
 * Classification Lambda:
 * - trackClassificationStarted() when starting classification
 * - trackClassificationCompleted() with results and duration
 * - trackClassificationFailed() on errors
 * 
 * Start-Processing Lambda:
 * - trackProcessingStarted() for each file being processed
 * - trackProcessingCompleted() when file processing done
 * - trackSapIntegrationStarted() when posting to SAP
 * - trackSapIntegrationCompleted() on SAP success
 * - trackSapIntegrationFailed() on SAP errors
 * - trackRetry() when retrying failed operations
 * 
 * Environment Variables to Add:
 * - TRACKING_QUEUE_URL: SQS queue URL from tracking stack output
 * 
 * Package.json Dependencies to Add:
 * - "@aws-sdk/client-sqs": "^3.0.0"
 */
