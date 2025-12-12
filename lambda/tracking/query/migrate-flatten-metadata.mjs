/**
 * Migration script to flatten metadata fields in existing tracking records
 * This adds top-level from, subject, emailId, and createdOn fields for better querying
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-2';
const TRACKING_TABLE = process.env.TRACKING_TABLE || 'order-vision-tracking-dev';

const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

async function migrateRecords() {
  let processedCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  let lastEvaluatedKey = undefined;

  console.log(`Starting migration for table: ${TRACKING_TABLE}`);
  console.log('This will add flattened metadata fields to existing records...\n');

  do {
    // Scan the table
    const scanParams = {
      TableName: TRACKING_TABLE,
      Limit: 100
    };

    if (lastEvaluatedKey) {
      scanParams.ExclusiveStartKey = lastEvaluatedKey;
    }

    const scanResult = await docClient.send(new ScanCommand(scanParams));
    const items = scanResult.Items || [];

    // Process each item
    for (const item of items) {
      processedCount++;

      try {
        // Check if item has metadata and needs migration
        if (item.metadata && !item.from && !item.subject) {
          const updates = {};
          let needsUpdate = false;

          // Extract flattened fields from metadata
          if (item.metadata.from) {
            updates.from = item.metadata.from;
            needsUpdate = true;
          }
          if (item.metadata.subject) {
            updates.subject = item.metadata.subject;
            needsUpdate = true;
          }
          if (item.metadata.emailId) {
            updates.emailId = item.metadata.emailId;
            needsUpdate = true;
          }
          if (item.metadata.CreatedOn) {
            updates.createdOn = item.metadata.CreatedOn;
            needsUpdate = true;
          }

          if (needsUpdate) {
            // Build update expression
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

            // Update the record
            const updateCommand = new UpdateCommand({
              TableName: TRACKING_TABLE,
              Key: {
                timestamp: item.timestamp,
                event_type: item.event_type
              },
              UpdateExpression: `SET ${updateExpression.join(', ')}`,
              ExpressionAttributeNames: expressionAttributeNames,
              ExpressionAttributeValues: expressionAttributeValues
            });

            await docClient.send(updateCommand);
            updatedCount++;

            if (updatedCount % 10 === 0) {
              console.log(`Progress: ${updatedCount} records updated...`);
            }
          }
        }
      } catch (error) {
        errorCount++;
        console.error(`Error updating record ${item.timestamp}-${item.event_type}:`, error.message);
      }
    }

    lastEvaluatedKey = scanResult.LastEvaluatedKey;

    console.log(`Scanned ${processedCount} records so far...`);

  } while (lastEvaluatedKey);

  console.log('\n=== Migration Complete ===');
  console.log(`Total records scanned: ${processedCount}`);
  console.log(`Records updated: ${updatedCount}`);
  console.log(`Errors: ${errorCount}`);
}

// Run migration
migrateRecords()
  .then(() => {
    console.log('\nMigration finished successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\nMigration failed:', error);
    process.exit(1);
  });
