#!/usr/bin/env node

import { CloudWatchLogsClient, FilterLogEventsCommand } from '@aws-sdk/client-cloudwatch-logs';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

// Parse command line arguments
const args = process.argv.slice(2);
let profile = 'bio-rad-dev';
let minutes = 10;
let region = 'us-east-2';
let mode = 'time'; // 'time', 'count', or 'all'
let limit = 20; // number of log events/uploads to check in count/all mode
let hours = 72; // hours to look back in all mode

// Parse arguments
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--profile' && args[i + 1]) {
        profile = args[i + 1];
        i++;
    } else if (args[i] === '--minutes' && args[i + 1]) {
        minutes = parseInt(args[i + 1]);
        i++;
    } else if (args[i] === '--region' && args[i + 1]) {
        region = args[i + 1];
        i++;
    } else if (args[i] === '--mode' && args[i + 1]) {
        mode = args[i + 1];
        if (mode !== 'time' && mode !== 'count' && mode !== 'all') {
            console.error('Error: --mode must be "time", "count", or "all"');
            process.exit(1);
        }
        i++;
    } else if (args[i] === '--limit' && args[i + 1]) {
        limit = parseInt(args[i + 1]);
        i++;
    } else if (args[i] === '--hours' && args[i + 1]) {
        hours = parseInt(args[i + 1]);
        i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
        console.log(`
Usage: node check-logs.mjs [options]

Options:
  --profile <name>    AWS profile to use (default: bio-rad-dev)
  --mode <type>       Search mode: "time", "count", or "all" (default: time)
  --minutes <number>  Number of minutes to look back in time mode (default: 10)
  --limit <number>    Number of recent items to check in count/all mode (default: 20)
  --hours <number>    Number of hours to look back in all mode (default: 72)
  --region <name>     AWS region (default: us-east-2)
  --help, -h          Show this help message

Modes:
  time  - Check CloudWatch logs for errors in last N minutes
  count - Check last N CloudWatch log events for errors
  all   - Check last N uploads in last X hours for missing/invalid files

Examples:
  # Check last 30 minutes of logs
  node check-logs.mjs --mode time --minutes 30 --profile bio-rad-prod
  
  # Check last 10 log events
  node check-logs.mjs --mode count --limit 10 --profile bio-rad-prod
  
  # Check last 20 uploads in last 72 hours (default for all mode)
  node check-logs.mjs --mode all --profile bio-rad-prod --limit 100
  
  # Check last 50 uploads in last 48 hours
  node check-logs.mjs --mode all --limit 50 --hours 48 --profile bio-rad-prod
        `);
        process.exit(0);
    }
}

// Set AWS profile
process.env.AWS_PROFILE = profile;

const logsClient = new CloudWatchLogsClient({ region });
const s3Client = new S3Client({ region });

// Determine bucket name based on profile
const bucketName = profile.includes('prod') ? 'order-vision-ai-prod' : 
                   profile.includes('qa') ? 'order-vision-ai-qa' : 
                   'order-vision-ai-dev';

console.log(`\n=== Checking Lambda Logs ${mode === 'all' ? 'and S3 Files' : ''} ===`);
if (mode === 'time') {
    console.log(`Mode: Time-based (last ${minutes} minutes)`);
} else if (mode === 'count') {
    console.log(`Mode: Count-based (last ${limit} log events per function)`);
} else {
    console.log(`Mode: All (last ${limit} uploads in last ${hours} hours)`);
}
console.log(`AWS Profile: ${profile}`);
console.log(`Region: ${region}`);
if (mode === 'all') {
    console.log(`S3 Bucket: ${bucketName}`);
}
console.log();

const logGroups = [
    '/aws/lambda/order-vision-upload',
    '/aws/lambda/order-vision-upload-check',
    '/aws/lambda/order-vision-classification',
    '/aws/lambda/order-vision-start-processing'
];

const stats = {
    totalErrors: 0,
    errorsByFunction: {},
    errorsByType: {},
    s3Issues: {
        missingClassification: [],
        missingProcessed: [],
        missingProcessing: [],
        noPurchaseOrder: []
    }
};

if (mode === 'all') {
    // Check S3 uploads
    console.log('\n=== Checking S3 Uploads ===\n');
    
    try {
        const cutoffTime = Date.now() - (hours * 60 * 60 * 1000);
        
        // List uploads directories - need to paginate to get all
        let allPrefixes = [];
        let continuationToken = undefined;
        
        do {
            const listCommand = new ListObjectsV2Command({
                Bucket: bucketName,
                Prefix: 'uploads/',
                Delimiter: '/',
                ContinuationToken: continuationToken
            });
            
            const listResponse = await s3Client.send(listCommand);
            
            if (listResponse.CommonPrefixes) {
                allPrefixes.push(...listResponse.CommonPrefixes);
            }
            
            continuationToken = listResponse.NextContinuationToken;
        } while (continuationToken);
        
        if (allPrefixes.length > 0) {
            // Get upload directories (timestamps)
            const uploadDirs = allPrefixes
                .map(prefix => {
                    const match = prefix.Prefix.match(/uploads\/(\d+)\//);
                    return match ? parseInt(match[1]) : null;
                })
                .filter(timestamp => timestamp && timestamp >= cutoffTime)
                .sort((a, b) => b - a) // Most recent first
                .slice(0, limit);
            
            console.log(`Found ${uploadDirs.length} uploads in the last ${hours} hours\n`);
            
            for (const timestamp of uploadDirs) {
                const uploadPath = `uploads/${timestamp}/`;
                console.log(`Checking ${timestamp} (${new Date(timestamp).toISOString()})...`);
                
                // Check for classification.json
                let hasClassification = false;
                let hasPurchaseOrder = false;
                let emailSubject = 'N/A';
                let attachmentDetails = [];
                
                try {
                    const classificationCommand = new GetObjectCommand({
                        Bucket: bucketName,
                        Key: `${uploadPath}classification.json`
                    });
                    const classificationResponse = await s3Client.send(classificationCommand);
                    const classificationData = await classificationResponse.Body.transformToString();
                    const classification = JSON.parse(classificationData);
                    hasClassification = true;
                    
                    // Get email subject
                    emailSubject = classification.metadata?.Subject || 'N/A';
                    console.log(`  📧 Subject: ${emailSubject}`);
                    
                    // Check if any attachment has Type "Purchase Order"
                    if (classification.metadata?.Attachments) {
                        // Collect attachment details with S3 keys
                        attachmentDetails = classification.metadata.Attachments.map(att => ({
                            name: att.AttachmentName || 'Unknown',
                            type: att.Type || 'Unknown',
                            key: att.key || 'Unknown',
                            s3Location: att.key ? `s3://${bucketName}${att.key}` : 'Unknown'
                        }));
                        
                        hasPurchaseOrder = attachmentDetails.some(att => att.type === 'Purchase Order');
                    }
                    
                    if (!hasPurchaseOrder) {
                        stats.s3Issues.noPurchaseOrder.push({
                            timestamp,
                            subject: emailSubject,
                            attachments: attachmentDetails
                        });
                        console.log('  ⚠️  No Purchase Order found in classification');
                        console.log('  📎 Attachments:');
                        attachmentDetails.forEach(att => {
                            console.log(`     - ${att.name} (Type: ${att.type})`);
                            console.log(`       ${att.s3Location}`);
                        });
                    } else {
                        console.log('  ✅ Classification found with Purchase Order');
                        // Show Purchase Order details
                        const purchaseOrders = attachmentDetails.filter(att => att.type === 'Purchase Order');
                        console.log('  📎 Purchase Order(s):');
                        purchaseOrders.forEach(po => {
                            console.log(`     - ${po.name}`);
                            console.log(`       ${po.s3Location}`);
                        });
                    }
                } catch (error) {
                    if (error.name === 'NoSuchKey') {
                        stats.s3Issues.missingClassification.push(timestamp);
                        console.log('  ❌ Missing classification.json');
                    }
                }
                
                // Check for processed.json
                try {
                    const processedCommand = new GetObjectCommand({
                        Bucket: bucketName,
                        Key: `${uploadPath}processed.json`
                    });
                    await s3Client.send(processedCommand);
                    console.log('  ✅ processed.json found');
                } catch (error) {
                    if (error.name === 'NoSuchKey') {
                        stats.s3Issues.missingProcessed.push(timestamp);
                        console.log('  ❌ Missing processed.json');
                    }
                }
                
                // Check for processing.txt
                try {
                    const processingCommand = new GetObjectCommand({
                        Bucket: bucketName,
                        Key: `${uploadPath}processing.txt`
                    });
                    await s3Client.send(processingCommand);
                    console.log('  ⚠️  processing.txt still present (may be in progress)');
                } catch (error) {
                    if (error.name === 'NoSuchKey') {
                        // This is actually good - processing.txt should be removed when done
                        console.log('  ✅ processing.txt removed (completed)');
                    }
                }
                
                console.log();
            }
        } else {
            console.log('No uploads found in the specified time range\n');
        }
    } catch (error) {
        console.error(`Error checking S3: ${error.message}\n`);
    }
}

// Check CloudWatch logs (for all modes)
console.log('\n=== Checking CloudWatch Logs ===\n');

for (const logGroup of logGroups) {
    const functionName = logGroup.split('/').pop();
    stats.errorsByFunction[functionName] = 0;
    
    try {
        console.log(`Checking ${functionName}...`);
        
        let response;
        
        if (mode === 'time') {
            // Time mode: filter for errors within time range
            const startTimeMs = Date.now() - (minutes * 60 * 1000);
            const command = new FilterLogEventsCommand({
                logGroupName: logGroup,
                startTime: startTimeMs,
                filterPattern: '?ERROR ?"Task timed out" ?"RateLimitError" ?"TypeError:" ?Exception ?Failed'
            });
            response = await logsClient.send(command);
        } else if (mode === 'count') {
            // Count mode: get latest N events from last 24 hours
            const startTimeMs = Date.now() - (24 * 60 * 60 * 1000);
            const command = new FilterLogEventsCommand({
                logGroupName: logGroup,
                startTime: startTimeMs,
                limit: limit
            });
            response = await logsClient.send(command);
            
            // Filter for errors manually
            if (response.events) {
                response.events = response.events.filter(event => {
                    const msg = event.message;
                    return msg.includes('ERROR') || 
                           msg.includes('Task timed out') || 
                           msg.includes('RateLimitError') || 
                           msg.includes('TypeError:') || 
                           msg.includes('Exception') || 
                           msg.includes('Failed') ||
                           msg.includes('failed');
                });
            }
        } else {
            // All mode: check logs from last X hours
            const startTimeMs = Date.now() - (hours * 60 * 60 * 1000);
            const command = new FilterLogEventsCommand({
                logGroupName: logGroup,
                startTime: startTimeMs,
                filterPattern: '?ERROR ?"Task timed out" ?"RateLimitError" ?"TypeError:" ?Exception ?Failed'
            });
            response = await logsClient.send(command);
        }
        
        if (response.events && response.events.length > 0) {
            console.log(`  Found ${response.events.length} potential error(s)`);
            
            response.events.forEach(event => {
                const message = event.message;
                stats.totalErrors++;
                stats.errorsByFunction[functionName]++;
                
                // Categorize error type
                let errorType = 'Other';
                if (message.includes('429') || message.includes('RateLimitError') || message.includes('rate limit')) {
                    errorType = 'Rate Limit';
                } else if (message.includes('timeout') || message.includes('Timeout') || message.includes('Task timed out')) {
                    errorType = 'Timeout';
                } else if (message.includes('TypeError') || message.includes('ERR_INVALID_ARG_TYPE')) {
                    errorType = 'TypeError';
                } else if (message.includes('Exception')) {
                    errorType = 'Exception';
                } else if (message.includes('failed') || message.includes('Failed')) {
                    errorType = 'Failed';
                } else if (message.includes('ERROR')) {
                    errorType = 'Error';
                }
                
                stats.errorsByType[errorType] = (stats.errorsByType[errorType] || 0) + 1;
                
                // Print error details
                const timestamp = new Date(event.timestamp).toISOString();
                console.log(`\n  [${timestamp}]`);
                console.log(`  ${message.substring(0, 200)}${message.length > 200 ? '...' : ''}`);
            });
        } else {
            console.log(`  ✅ No errors found`);
        }
        
    } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
            console.log(`  ⚠️  Log group not found (function may not have been invoked)`);
        } else {
            console.error(`  Error checking logs: ${error.message}`);
        }
    }
}

// Print summary
console.log(`\n${'='.repeat(80)}`);
console.log(`=== Summary ===`);

if (mode === 'all') {
    console.log(`\nS3 File Issues:`);
    console.log(`  Missing classification.json: ${stats.s3Issues.missingClassification.length}`);
    if (stats.s3Issues.missingClassification.length > 0) {
        stats.s3Issues.missingClassification.forEach(ts => {
            console.log(`    - ${ts} (${new Date(ts).toISOString()})`);
        });
    }
    
    console.log(`  Missing processed.json: ${stats.s3Issues.missingProcessed.length}`);
    if (stats.s3Issues.missingProcessed.length > 0) {
        stats.s3Issues.missingProcessed.forEach(ts => {
            console.log(`    - ${ts} (${new Date(ts).toISOString()})`);
        });
    }
    
    console.log(`  No Purchase Order in classification: ${stats.s3Issues.noPurchaseOrder.length}`);
    if (stats.s3Issues.noPurchaseOrder.length > 0) {
        stats.s3Issues.noPurchaseOrder.forEach(item => {
            console.log(`    - ${item.timestamp} (${new Date(item.timestamp).toISOString()})`);
            console.log(`      Subject: ${item.subject}`);
            console.log(`      Attachments:`);
            item.attachments.forEach(att => {
                console.log(`        • ${att.name} (Type: ${att.type})`);
                console.log(`          ${att.s3Location}`);
            });
        });
    }
}

console.log(`\nCloudWatch Errors: ${stats.totalErrors}`);

if (stats.totalErrors > 0) {
    console.log(`\nErrors by Function:`);
    Object.entries(stats.errorsByFunction).forEach(([func, count]) => {
        if (count > 0) {
            console.log(`  ${func}: ${count}`);
        }
    });
    
    console.log(`\nErrors by Type:`);
    Object.entries(stats.errorsByType).forEach(([type, count]) => {
        console.log(`  ${type}: ${count}`);
    });
}

const totalIssues = stats.totalErrors + 
    (mode === 'all' ? (
        stats.s3Issues.missingClassification.length +
        stats.s3Issues.missingProcessed.length +
        stats.s3Issues.noPurchaseOrder.length
    ) : 0);

if (totalIssues > 0) {
    console.log(`\n⚠️  ${totalIssues} total issue(s) detected! Review details above.`);
} else {
    if (mode === 'time') {
        console.log(`\n✅ No issues detected in the last ${minutes} minutes!`);
    } else if (mode === 'count') {
        console.log(`\n✅ No issues detected in the last ${limit} log events per function!`);
    } else {
        console.log(`\n✅ No issues detected in the last ${limit} uploads (${hours} hours)!`);
    }
}

console.log(`${'='.repeat(80)}\n`);
