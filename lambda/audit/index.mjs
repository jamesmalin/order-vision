import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config();

const BUCKET_NAME = process.env.BUCKET_NAME || 'order-vision-ai-dev';
const REGION = process.env.REGION || 'us-east-2';

const s3Client = new S3Client({ region: REGION });

/**
 * Helper function to read and parse JSON from S3
 */
async function getS3Json(bucket, key) {
  try {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });
    const response = await s3Client.send(command);
    const bodyContents = await streamToString(response.Body);
    return JSON.parse(bodyContents);
  } catch (error) {
    console.error(`Error reading ${key}:`, error.message);
    return null;
  }
}

/**
 * Helper function to convert stream to string
 */
async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

/**
 * List all files in a specific upload directory
 */
async function listDirectoryFiles(bucket, prefix) {
  try {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix
    });
    const response = await s3Client.send(command);
    
    if (!response.Contents) {
      return [];
    }
    
    return response.Contents.map(item => ({
      name: item.Key.split('/').pop(),
      s3Uri: `s3://${bucket}/${item.Key}`,
      size: item.Size,
      lastModified: item.LastModified.toISOString()
    }));
  } catch (error) {
    console.error(`Error listing files in ${prefix}:`, error.message);
    return [];
  }
}

/**
 * Get recent upload directories sorted by timestamp (descending)
 */
async function getRecentUploadDirectories(bucket, limit = 10) {
  try {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: 'uploads/',
      Delimiter: '/'
    });
    
    const response = await s3Client.send(command);
    
    if (!response.CommonPrefixes) {
      return [];
    }
    
    // Extract timestamps from directory names and sort descending
    const directories = response.CommonPrefixes
      .map(prefix => {
        const dirName = prefix.Prefix.replace('uploads/', '').replace('/', '');
        return {
          timestamp: dirName,
          prefix: prefix.Prefix
        };
      })
      .filter(dir => dir.timestamp && !isNaN(dir.timestamp))
      .sort((a, b) => parseInt(b.timestamp) - parseInt(a.timestamp))
      .slice(0, limit);
    
    return directories;
  } catch (error) {
    console.error('Error listing upload directories:', error);
    throw error;
  }
}

/**
 * Check if a string matches search criteria (case-insensitive partial match)
 */
function matchesSearch(value, searchTerm) {
  if (!searchTerm || !value) return false;
  return value.toLowerCase().includes(searchTerm.toLowerCase());
}

/**
 * Check if an array contains a value matching search criteria
 */
function arrayContainsMatch(array, searchTerm) {
  if (!searchTerm || !Array.isArray(array)) return false;
  return array.some(item => matchesSearch(item, searchTerm));
}

/**
 * Check if metadata matches search criteria
 */
function matchesCriteria(metadata, searchCriteria) {
  const { subject, from, to, cc, emailId } = searchCriteria;
  
  // If emailId is specified, it must match exactly
  if (emailId && metadata.EmailId !== emailId) {
    return false;
  }
  
  // Check subject (partial match)
  if (subject && !matchesSearch(metadata.Subject, subject)) {
    return false;
  }
  
  // Check from (partial match)
  if (from && !matchesSearch(metadata.From, from)) {
    return false;
  }
  
  // Check to array (partial match on any element)
  if (to && !arrayContainsMatch(metadata.To, to)) {
    return false;
  }
  
  // Check cc array (partial match on any element)
  if (cc && !arrayContainsMatch(metadata.Cc, cc)) {
    return false;
  }
  
  return true;
}

/**
 * Process a single upload directory
 */
async function processDirectory(bucket, directory) {
  const { timestamp, prefix } = directory;
  
  // Read metadata.json
  const metadata = await getS3Json(bucket, `${prefix}metadata.json`);
  if (!metadata) {
    return null;
  }
  
  // List all files in the directory
  const files = await listDirectoryFiles(bucket, prefix);
  
  // Check for processing flag and classification
  const hasProcessingFlag = files.some(f => f.name === 'processing.txt');
  const hasClassification = files.some(f => f.name === 'classification.json');
  
  // Get classification data if it exists
  let classification = null;
  if (hasClassification) {
    classification = await getS3Json(bucket, `${prefix}classification.json`);
  }
  
  return {
    timestamp,
    s3Path: `s3://${bucket}/${prefix}`,
    metadata,
    files,
    hasProcessingFlag,
    hasClassification,
    classification
  };
}

/**
 * Main Lambda handler
 */
export const handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  try {
    // Parse search criteria from event
    let searchCriteria = {};
    if (event.body) {
      searchCriteria = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
    } else {
      searchCriteria = event;
    }
    
    const {
      subject,
      from,
      to,
      cc,
      emailId,
      limit = 10
    } = searchCriteria;
    
    console.log('Search criteria:', searchCriteria);
    console.log(`Searching bucket: ${BUCKET_NAME}`);
    
    // Get recent upload directories
    const directories = await getRecentUploadDirectories(BUCKET_NAME, limit);
    console.log(`Found ${directories.length} recent directories`);
    
    // Process all directories in parallel
    const processedResults = await Promise.all(
      directories.map(dir => processDirectory(BUCKET_NAME, dir))
    );
    
    // Filter out null results and apply search criteria
    const allResults = processedResults.filter(result => result !== null);
    const matches = allResults.filter(result => 
      matchesCriteria(result.metadata, searchCriteria)
    );
    
    console.log(`Searched ${allResults.length} uploads, found ${matches.length} matches`);
    
    const response = {
      matches,
      searchedCount: allResults.length,
      matchCount: matches.length,
      searchCriteria: {
        subject,
        from,
        to,
        cc,
        emailId,
        limit,
        bucket: BUCKET_NAME
      }
    };
    
    return {
      statusCode: 200,
      body: JSON.stringify(response, null, 2)
    };
  } catch (error) {
    console.error('Error processing audit request:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message
      })
    };
  }
};
