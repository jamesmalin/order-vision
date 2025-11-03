import { S3Client, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { trackUploadCheckStarted, trackUploadCheckCompleted, trackUploadCheckFailed, trackClassificationStarted } from './tracking-utils.mjs';
import dotenv from 'dotenv';
dotenv.config();

const BUCKET_NAME = process.env.BUCKET_NAME || 'order-vision-ai-dev';
const REGION = process.env.REGION || 'us-east-2';
// const LAMBDA_FUNCTION_NAME = 'order-vision-start-processing';
const LAMBDA_FUNCTION_NAME = 'order-vision-classification';

const s3Client = new S3Client({ region: REGION });
const lambdaClient = new LambdaClient({ region: REGION });

// Function to send alert to CloudWatch alerts Lambda using direct Lambda invocation
async function sendAlert(alertData) {
  const environment = process.env.ENVIRONMENT || 'Development';
  
  const payload = {
    lambda: 'Order Vision Upload Check',
    environment: environment,
    alertType: 'manual',
    alarmName: 'Processing Error',
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

async function fetchJsonFileContents(key) {
    const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
    const response = await s3Client.send(command);
    const body = await response.Body.transformToString();
    return JSON.parse(body);
}

async function checkFilesUploaded(timestamp, attachments) {
    const prefix = `uploads/${timestamp}/`;
    const command = new ListObjectsV2Command({ Bucket: BUCKET_NAME, Prefix: prefix });
    const response = await s3Client.send(command);
    const uploadedFiles = response.Contents ? response.Contents.map(file => file.Key.split('/').pop()) : [];
    
    // Check for metadata.json and all attachments
    const hasMetadata = uploadedFiles.includes('metadata.json');
    const missingFiles = [];
    
    if (!hasMetadata) {
        missingFiles.push({ AttachmentName: 'metadata.json' });
    }
    
    // Check for each attachment listed in metadata
    attachments.forEach(attachment => {
        if (!uploadedFiles.includes(attachment.AttachmentName)) {
            missingFiles.push(attachment);
        }
    });

    return { allUploaded: missingFiles.length === 0, missingFiles };
}

async function createMissingFile(timestamp, rootJsonFile, missingFiles = []) {
    const missingFileKey = `uploads/${timestamp}/missing.json`;
    
    // Check if missing.json already exists
    try {
        await s3Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: missingFileKey }));
        console.log(`missing.json already exists in /uploads/${timestamp}/`);
        
        // If missing.json exists, delete the root JSON file
        await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: rootJsonFile.Key }));
        console.log(`Deleted JSON file: ${rootJsonFile.Key}`);

        // Send alert for missing files
        await sendAlert({
            message: `Upload check failed: Missing files detected after timeout. Timestamp: ${timestamp}, Missing files: ${JSON.stringify(missingFiles.map(f => f.AttachmentName))}`
        });

        // Create failed.json file in /failed/{timestamp}/failed.json
        const failedFileKey = `failed/${timestamp}/failed.json`;
        const failedContent = {
            "reason": "missing files from metadata"
        };
        
        const failedPutCommand = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: failedFileKey,
            Body: JSON.stringify(failedContent),
            Tagging: 'AllowDelete=true'
        });
        
        await s3Client.send(failedPutCommand);
        console.log(`Created failed.json file at /failed/${timestamp}/failed.json`);
        
        // Start over to check for another root JSON file
        await findJsonFileAndExecuteLambda();
        return;
    } catch (error) {
        if (error.name !== 'NoSuchKey') {
            throw error;
        }
    }

    // Create missing.json if it doesn't exist
    const putCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: missingFileKey,
        Body: JSON.stringify({ message: 'One or more files are missing.' }),
        Tagging: 'AllowDelete=true'
    });
    await s3Client.send(putCommand);
    console.log(`Created missing.json file in /uploads/${timestamp}/`);
}

async function deleteMissingFile(timestamp) {
    const missingFileKey = `uploads/${timestamp}/missing.json`;
    const deleteCommand = new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: missingFileKey });

    try {
        await s3Client.send(deleteCommand);
        console.log(`Deleted missing.json file from /uploads/${timestamp}/`);
    } catch (error) {
        if (error.name === 'NoSuchKey') {
            console.log(`No missing.json file found to delete in /uploads/${timestamp}/`);
        } else {
            throw error;
        }
    }
}

async function retryLambdaInvocation(payload, maxRetries = 3, delay = 5000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const invokeCommand = new InvokeCommand({
                FunctionName: LAMBDA_FUNCTION_NAME,
                Payload: Buffer.from(JSON.stringify(payload)),
            });

            const response = await lambdaClient.send(invokeCommand);
            console.log(`Lambda invocation response (Attempt ${attempt}):`, response);

            if (!response.FunctionError) {
                return response;
            }

            console.warn(`Lambda returned error: ${response.Payload?.toString()}`);
        } catch (error) {
            if (error.name === 'CodeArtifactUserPendingException') {
                console.warn(`Lambda is initializing. Retrying in ${delay}ms...`);
                await new Promise(res => setTimeout(res, delay));
                delay *= 2; // Exponential backoff
            } else {
                throw error; // Stop retries on other errors
            }
        }
    }
    throw new Error(`Lambda invocation failed after ${maxRetries} retries.`);
}

async function findJsonFileAndExecuteLambda() {
    let timestamp;
    let metadata;
    
    try {
        const response = await s3Client.send(new ListObjectsV2Command({ Bucket: BUCKET_NAME }));
        if (!response.Contents || response.Contents.length === 0) {
            console.log('No files found in the root directory.');
            return;
        }

        const rootJsonFile = response.Contents.find(file => file.Key.endsWith('.json') && !file.Key.includes('/'));
        if (!rootJsonFile) {
            console.log('No JSON files found in the root directory.');
            return;
        }

        console.log(`Found JSON file: ${rootJsonFile.Key}`);
        metadata = await fetchJsonFileContents(rootJsonFile.Key);
        const { CreatedOn, Attachments } = metadata;
        timestamp = new Date(CreatedOn).getTime();

        // Track upload check started
        await trackUploadCheckStarted(timestamp, metadata);

        const { allUploaded, missingFiles } = await checkFilesUploaded(timestamp, Attachments);

        if (!allUploaded) {
            console.log('Missing files:', missingFiles.map(file => file.AttachmentName));
            // Track upload check failed for missing files
            await trackUploadCheckFailed(timestamp, metadata, `Missing files: ${missingFiles.map(f => f.AttachmentName).join(', ')}`);
            await createMissingFile(timestamp, rootJsonFile, missingFiles);
            return;
        }

        await deleteMissingFile(timestamp);
        console.log('All files have been uploaded successfully.');

        // Track upload check completed
        await trackUploadCheckCompleted(timestamp, metadata);

        // Add key to each attachment
        metadata.Attachments = metadata.Attachments.map(attachment => ({
            ...attachment,
            key: `/uploads/${timestamp}/${attachment.AttachmentName}`
        }));

        const payload = { timestamp, metadata };
        console.log(JSON.stringify(payload));

        console.log('Running lambda function: ', LAMBDA_FUNCTION_NAME);

        // Track classification started
        await trackClassificationStarted(timestamp, metadata);

        // Invoke Lambda asynchronously
        const invokeCommand = new InvokeCommand({
            FunctionName: LAMBDA_FUNCTION_NAME,
            Payload: Buffer.from(JSON.stringify(payload)),
            InvocationType: 'Event'  // Async invocation
        });
        
        lambdaClient.send(invokeCommand).catch(async (error) => {
            console.error('Error starting Lambda:', error);
            await sendAlert({
                message: `Failed to invoke ${LAMBDA_FUNCTION_NAME} lambda. Timestamp: ${timestamp}, Error: ${error.message}`
            });
        });

        // Create processing.txt file
        const processingFileKey = `uploads/${timestamp}/processing.txt`;
        const putCommand = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: processingFileKey,
            Body: '',
            Tagging: 'AllowDelete=true'
        });
        await s3Client.send(putCommand);
        console.log(`Created processing.txt file in /uploads/${timestamp}/`);

        await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: rootJsonFile.Key }));
        console.log(`Deleted JSON file: ${rootJsonFile.Key}`);
    } catch (error) {
        console.error('Error:', error);
        // Track upload check failed for general errors
        if (timestamp && metadata) {
            await trackUploadCheckFailed(timestamp, metadata, error.message);
        }
    }
}

export const handler = async (event) => {
    await findJsonFileAndExecuteLambda();
    return {
        statusCode: 200,
        body: JSON.stringify({ message: 'Function executed successfully' }),
    };
};
