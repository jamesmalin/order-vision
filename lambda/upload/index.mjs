import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { normalizeEmailObject } from './email-utils.mjs';
import { trackUploadStarted, trackUploadCompleted, trackUploadFailed } from './tracking-utils.mjs';
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
      InvocationType: 'Event', // Asynchronous invocation
      Payload: JSON.stringify(payload)
    });

    await lambdaClient.send(command);
    console.log('Alert sent successfully to cloudwatch-alerts lambda');
  } catch (error) {
    console.error('Error sending alert to cloudwatch-alerts lambda:', error);
    // Don't fail the main function if alert fails
  }
}

export const handler = async (event) => {
  console.log(event);
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

  // Create timestamp and metadata for tracking
  timestamp = new Date(CreatedOn).getTime();
  metadata = {
    CreatedOn,
    EmailId,
    Subject,
    From,
    To,
    Cc,
    Body,
    Attachments
  };

  // Track upload started
  await trackUploadStarted(timestamp, metadata);

  if (!Array.isArray(Attachments) || Attachments.length === 0) {
    // Track upload failed and send alert for missing/invalid attachments
    await trackUploadFailed(timestamp, metadata, 'Attachments must be a non-empty array of objects');
    await sendAlert({
      message: `Upload validation failed: Attachments must be a non-empty array of objects. EmailId: ${EmailId || 'Unknown'}, Subject: ${Subject || 'Unknown'}`
    });
    
    return {
      statusCode: 400,
      body: JSON.stringify({ message: 'Attachments must be a non-empty array of objects' }),
    };
  }

  if (!CreatedOn) {
    // Track upload failed and send alert for missing CreatedOn
    await trackUploadFailed(timestamp, metadata, 'CreatedOn is required');
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
  
  try {
    // Generate pre-signed URLs for each file
    const urls = await Promise.all(
      Attachments.map(async (file) => {
        const fileKey = `${baseDir}/${file.AttachmentName}`;

        const command = new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: fileKey,
          ContentType: 'application/octet-stream',
        });

        const url = await getSignedUrl(s3Client, command, { expiresIn: 300 }); // change back to 300

        return { FileName: file.AttachmentName, Url: url, FileKey: fileKey };
      })
    );

    // Upload the metadata JSON file
    const metadataKey = `${baseDir}/metadata.json`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: metadataKey,
        Body: JSON.stringify(metadata),
        ContentType: 'application/json',
      })
    );

    // Upload copy of the metadata JSON file to the root directory
    const rootMetadataKey = `${timestamp}.json`;
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: rootMetadataKey,
        Body: JSON.stringify(metadata),
        ContentType: 'application/json',
        Tagging: 'AllowDelete=true'
      })
    );

    console.log(urls);

    // Track upload completed
    await trackUploadCompleted(timestamp, metadata, urls);

    return {
      statusCode: 200,
      body: urls,
    };
  } catch (error) {
    // Track upload failed
    await trackUploadFailed(timestamp, metadata, error.message);
    throw error;
  }
};
