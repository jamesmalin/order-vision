import { DynamoDBClient, ScanCommand as RawScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall, marshall } from '@aws-sdk/util-dynamodb';

const REGION = process.env.AWS_REGION || 'us-east-2';
const TRACKING_TABLE = process.env.TRACKING_TABLE;

const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

/**
 * Parse flexible time parameter - accepts Unix timestamp or ISO 8601 string
 */
function parseTimeParameter(timeValue) {
  if (!timeValue) return null;
  
  // If it's a number or numeric string, treat as Unix timestamp
  if (!isNaN(timeValue)) {
    return parseInt(timeValue);
  }
  
  // If it's a string, try to parse as ISO 8601 date
  try {
    const date = new Date(timeValue);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format');
    }
    return date.getTime();
  } catch (error) {
    throw new Error(`Invalid time format: ${timeValue}. Use Unix timestamp or ISO 8601 format.`);
  }
}

/**
 * Parse date range parameters
 */
function parseDateRange(startDate, endDate) {
  const range = {};
  
  if (startDate) {
    range.start = parseTimeParameter(startDate);
  }
  
  if (endDate) {
    range.end = parseTimeParameter(endDate);
  }
  
  return range;
}

/**
 * Build filter expression for metadata searches
 * Uses flattened top-level fields for reliable querying
 */
function buildMetadataFilter(params) {
  const filterExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  let valueIndex = 0;

  // Email ID filter (top-level field)
  if (params.emailId) {
    const valueKey = `:emailId${valueIndex++}`;
    filterExpressions.push(`#emailId = ${valueKey}`);
    expressionAttributeNames['#emailId'] = 'emailId';
    expressionAttributeValues[valueKey] = params.emailId;
  }

  // Subject filter (partial match on top-level field)
  if (params.subject) {
    const valueKey = `:subject${valueIndex++}`;
    filterExpressions.push(`contains(#subject, ${valueKey})`);
    expressionAttributeNames['#subject'] = 'subject';
    expressionAttributeValues[valueKey] = params.subject;
  }

  // From filter (top-level field)
  if (params.from) {
    const valueKey = `:from${valueIndex++}`;
    filterExpressions.push(`#from = ${valueKey}`);
    expressionAttributeNames['#from'] = 'from';
    expressionAttributeValues[valueKey] = params.from;
  }

  // CreatedOn filter (exact match on top-level field)
  if (params.createdOn) {
    const valueKey = `:createdOn${valueIndex++}`;
    filterExpressions.push(`#createdOn = ${valueKey}`);
    expressionAttributeNames['#createdOn'] = 'createdOn';
    expressionAttributeValues[valueKey] = params.createdOn;
  }

  // Event type filter
  if (params.event_type) {
    const valueKey = `:eventType${valueIndex++}`;
    filterExpressions.push(`#eventType = ${valueKey}`);
    expressionAttributeNames['#eventType'] = 'event_type';
    expressionAttributeValues[valueKey] = params.event_type;
  }

  return {
    filterExpression: filterExpressions.length > 0 ? filterExpressions.join(' AND ') : null,
    expressionAttributeNames: Object.keys(expressionAttributeNames).length > 0 ? expressionAttributeNames : undefined,
    expressionAttributeValues: Object.keys(expressionAttributeValues).length > 0 ? expressionAttributeValues : undefined
  };
}

/**
 * Query by exact timestamp
 */
async function queryByTimestamp(timestamp, additionalFilters = {}) {
  const params = {
    TableName: TRACKING_TABLE,
    KeyConditionExpression: '#timestamp = :timestamp',
    ExpressionAttributeNames: {
      '#timestamp': 'timestamp'
    },
    ExpressionAttributeValues: {
      ':timestamp': parseInt(timestamp)
    }
  };

  // Add event_type filter if specified
  if (additionalFilters.event_type) {
    params.KeyConditionExpression += ' AND #eventType = :eventType';
    params.ExpressionAttributeNames['#eventType'] = 'event_type';
    params.ExpressionAttributeValues[':eventType'] = additionalFilters.event_type;
  }

  // Add other filters
  const metadataFilter = buildMetadataFilter(additionalFilters);
  if (metadataFilter.filterExpression) {
    params.FilterExpression = metadataFilter.filterExpression;
    Object.assign(params.ExpressionAttributeNames, metadataFilter.expressionAttributeNames);
    Object.assign(params.ExpressionAttributeValues, metadataFilter.expressionAttributeValues);
  }

  const command = new QueryCommand(params);
  return await docClient.send(command);
}

/**
 * Query by status using GSI
 */
async function queryByStatus(status, dateRange = {}, additionalFilters = {}, limit = 50) {
  const params = {
    TableName: TRACKING_TABLE,
    IndexName: 'status-timestamp-index',
    KeyConditionExpression: '#status = :status',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': status
    },
    Limit: limit,
    ScanIndexForward: false // Most recent first
  };

  // Add date range if specified
  if (dateRange.start || dateRange.end) {
    if (dateRange.start && dateRange.end) {
      params.KeyConditionExpression += ' AND #eventTimestamp BETWEEN :startDate AND :endDate';
      params.ExpressionAttributeNames['#eventTimestamp'] = 'event_timestamp';
      params.ExpressionAttributeValues[':startDate'] = new Date(dateRange.start).toISOString();
      params.ExpressionAttributeValues[':endDate'] = new Date(dateRange.end).toISOString();
    } else if (dateRange.start) {
      params.KeyConditionExpression += ' AND #eventTimestamp >= :startDate';
      params.ExpressionAttributeNames['#eventTimestamp'] = 'event_timestamp';
      params.ExpressionAttributeValues[':startDate'] = new Date(dateRange.start).toISOString();
    } else if (dateRange.end) {
      params.KeyConditionExpression += ' AND #eventTimestamp <= :endDate';
      params.ExpressionAttributeNames['#eventTimestamp'] = 'event_timestamp';
      params.ExpressionAttributeValues[':endDate'] = new Date(dateRange.end).toISOString();
    }
  }

  // Add metadata filters
  const metadataFilter = buildMetadataFilter(additionalFilters);
  if (metadataFilter.filterExpression) {
    params.FilterExpression = metadataFilter.filterExpression;
    Object.assign(params.ExpressionAttributeNames, metadataFilter.expressionAttributeNames);
    Object.assign(params.ExpressionAttributeValues, metadataFilter.expressionAttributeValues);
  }

  const command = new QueryCommand(params);
  return await docClient.send(command);
}

/**
 * Scan table with filters (less efficient, use sparingly)
 * Continues scanning until we have the requested number of matching results
 * Uses post-processing for subject filter due to DocumentClient contains() limitations
 */
async function scanWithFilters(filters, dateRange = {}, limit = 50) {
  const allItems = [];
  let lastEvaluatedKey = undefined;
  let scannedCount = 0;
  const maxScans = 50; // Scan up to 5000 items to find matches
  let scanCount = 0;

  const filterExpressions = [];
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};

  // Store subject filter for post-processing
  const subjectFilter = filters.subject;
  const filtersWithoutSubject = { ...filters };
  delete filtersWithoutSubject.subject;

  // Add date range filter
  if (dateRange.start || dateRange.end) {
    if (dateRange.start && dateRange.end) {
      filterExpressions.push('#timestamp BETWEEN :startTimestamp AND :endTimestamp');
      expressionAttributeNames['#timestamp'] = 'timestamp';
      expressionAttributeValues[':startTimestamp'] = dateRange.start;
      expressionAttributeValues[':endTimestamp'] = dateRange.end;
    } else if (dateRange.start) {
      filterExpressions.push('#timestamp >= :startTimestamp');
      expressionAttributeNames['#timestamp'] = 'timestamp';
      expressionAttributeValues[':startTimestamp'] = dateRange.start;
    } else if (dateRange.end) {
      filterExpressions.push('#timestamp <= :endTimestamp');
      expressionAttributeNames['#timestamp'] = 'timestamp';
      expressionAttributeValues[':endTimestamp'] = dateRange.end;
    }
  }

  // Add metadata filters (excluding subject for post-processing)
  const metadataFilter = buildMetadataFilter(filtersWithoutSubject);
  if (metadataFilter.filterExpression) {
    filterExpressions.push(metadataFilter.filterExpression);
    Object.assign(expressionAttributeNames, metadataFilter.expressionAttributeNames);
    Object.assign(expressionAttributeValues, metadataFilter.expressionAttributeValues);
  }

  // Keep scanning until we have enough matching results or run out of data
  do {
    const params = {
      TableName: TRACKING_TABLE,
      Limit: 100 // Scan 100 items at a time for efficiency
    };

    if (filterExpressions.length > 0) {
      params.FilterExpression = filterExpressions.join(' AND ');
      params.ExpressionAttributeNames = expressionAttributeNames;
      params.ExpressionAttributeValues = expressionAttributeValues;
    }

    if (lastEvaluatedKey) {
      params.ExclusiveStartKey = lastEvaluatedKey;
    }

    const command = new ScanCommand(params);
    const result = await docClient.send(command);

    console.log(`Scan returned ${result.Items?.length || 0} items`);

    if (result.Items && result.Items.length > 0) {
      // Apply subject filter in post-processing if specified
      let filteredItems = result.Items;
      if (subjectFilter) {
        console.log(`Applying subject filter: "${subjectFilter}"`);
        filteredItems = result.Items.filter(item => {
          const hasSubject = item.subject && item.subject.toLowerCase().includes(subjectFilter.toLowerCase());
          if (hasSubject) {
            console.log(`Match found: ${item.subject}`);
          }
          return hasSubject;
        });
        console.log(`After subject filter: ${filteredItems.length} items`);
      }
      
      allItems.push(...filteredItems);
    }

    scannedCount += result.ScannedCount || 0;
    lastEvaluatedKey = result.LastEvaluatedKey;
    scanCount++;

    // Continue if we don't have enough results yet and there's more data
  } while (allItems.length < limit && lastEvaluatedKey && scanCount < maxScans);

  // Return only the requested number of items
  return {
    Items: allItems.slice(0, limit),
    ScannedCount: scannedCount,
    LastEvaluatedKey: allItems.length >= limit ? lastEvaluatedKey : undefined
  };
}

/**
 * Main query handler
 */
async function executeQuery(queryParams) {
  const {
    timestamp,
    time,
    createdOn,
    emailId,
    subject,
    from,
    status,
    event_type,
    startDate,
    endDate,
    limit = 50
  } = queryParams;

  const parsedLimit = Math.min(parseInt(limit) || 50, 100); // Max 100 items
  const dateRange = parseDateRange(startDate, endDate);
  
  const additionalFilters = {
    createdOn,
    emailId,
    subject,
    from,
    event_type
  };

  // Strategy 1: Exact timestamp query (most efficient)
  if (timestamp) {
    const parsedTimestamp = parseTimeParameter(timestamp);
    return await queryByTimestamp(parsedTimestamp, additionalFilters);
  }

  // Strategy 2: Flexible time parameter
  if (time) {
    const parsedTime = parseTimeParameter(time);
    return await queryByTimestamp(parsedTime, additionalFilters);
  }

  // Strategy 3: Status-based query with GSI (efficient)
  if (status) {
    return await queryByStatus(status, dateRange, additionalFilters, parsedLimit);
  }

  // Strategy 4: Scan with filters (less efficient, but necessary for metadata searches)
  return await scanWithFilters(additionalFilters, dateRange, parsedLimit);
}

/**
 * Build complete pipeline status for a timestamp
 */
function buildPipelineStatus(items, timestamp) {
  const pipeline = {
    timestamp: parseInt(timestamp),
    status: 'in_progress',
    steps: {
      upload: { status: 'not_started', events: [] },
      upload_check: { status: 'not_started', events: [] },
      classification: { status: 'not_started', events: [] },
      processing: { status: 'not_started', events: [] },
      sap_delivery: { status: 'not_started', events: [] }
    },
    metadata: null,
    summary: {
      total_steps: 5,
      completed_steps: 0,
      failed_steps: 0,
      current_step: null,
      overall_status: 'not_started'
    }
  };

  // Group events by step
  items.forEach(item => {
    const eventType = item.event_type;
    let step = null;

    // Map event types to pipeline steps
    if (eventType.startsWith('upload_') && !eventType.startsWith('upload_check_')) {
      step = 'upload';
    } else if (eventType.startsWith('upload_check_')) {
      step = 'upload_check';
    } else if (eventType.startsWith('classification_')) {
      step = 'classification';
    } else if (eventType.startsWith('processing_')) {
      step = 'processing';
    } else if (eventType.startsWith('sap_delivery_')) {
      step = 'sap_delivery';
    }

    if (step && pipeline.steps[step]) {
      pipeline.steps[step].events.push(item);
      
      // Update step status based on event type and status
      if (item.event_type.endsWith('_completed')) {
        pipeline.steps[step].status = 'completed';
      } else if (item.event_type.endsWith('_failed') || item.status === 'failed') {
        pipeline.steps[step].status = 'failed';
      } else if (item.event_type.endsWith('_started') && pipeline.steps[step].status === 'not_started') {
        pipeline.steps[step].status = 'in_progress';
      }

      // Capture metadata from the first event that has it
      if (item.metadata && !pipeline.metadata) {
        pipeline.metadata = item.metadata;
      }
    }
  });

  // Calculate summary statistics
  let completedSteps = 0;
  let failedSteps = 0;
  let currentStep = null;
  let overallStatus = 'not_started';

  const stepOrder = ['upload', 'upload_check', 'classification', 'processing', 'sap_delivery'];
  
  for (const stepName of stepOrder) {
    const step = pipeline.steps[stepName];
    
    if (step.status === 'completed') {
      completedSteps++;
    } else if (step.status === 'failed') {
      failedSteps++;
      overallStatus = 'failed';
      currentStep = stepName;
      break; // Stop at first failure
    } else if (step.status === 'in_progress') {
      overallStatus = 'in_progress';
      currentStep = stepName;
      break; // Stop at first in-progress step
    } else if (step.status === 'not_started') {
      if (completedSteps > 0) {
        // Previous steps completed, this is the next step
        currentStep = stepName;
        overallStatus = completedSteps === 5 ? 'completed' : 'waiting';
      }
      break; // Stop at first not-started step
    }
  }

  // If all steps completed and no failures
  if (completedSteps === 5 && failedSteps === 0) {
    overallStatus = 'completed';
    currentStep = null;
  }

  pipeline.summary = {
    total_steps: 5,
    completed_steps: completedSteps,
    failed_steps: failedSteps,
    current_step: currentStep,
    overall_status: overallStatus
  };

  return pipeline;
}

/**
 * Format response
 */
function formatResponse(result, queryParams) {
  const items = result.Items || [];
  
  // If querying by timestamp or time, provide pipeline status
  if (queryParams.timestamp || queryParams.time) {
    const timestamp = queryParams.timestamp || parseTimeParameter(queryParams.time);
    const pipelineStatus = buildPipelineStatus(items, timestamp);
    
    return {
      success: true,
      pipeline: pipelineStatus,
      raw_events: items,
      query: queryParams,
      event_count: items.length
    };
  }
  
  // Default response format for other queries
  return {
    success: true,
    count: items.length,
    items: items,
    query: queryParams,
    pagination: {
      hasMore: !!result.LastEvaluatedKey,
      lastEvaluatedKey: result.LastEvaluatedKey || null
    },
    scannedCount: result.ScannedCount,
    consumedCapacity: result.ConsumedCapacity
  };
}

/**
 * Lambda handler
 */
export const handler = async (event) => {
  console.log('Tracking Query API called:', JSON.stringify(event, null, 2));

  try {
    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    
    // Validate required table name
    if (!TRACKING_TABLE) {
      throw new Error('TRACKING_TABLE environment variable not configured');
    }

    // Execute query
    const result = await executeQuery(queryParams);
    
    // Format and return response
    const response = formatResponse(result, queryParams);
    
    console.log(`Query completed: ${response.count} items returned`);
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
        'Access-Control-Allow-Methods': 'GET,OPTIONS'
      },
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('Error in tracking query:', error);
    
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        success: false,
        error: error.message,
        query: event.queryStringParameters || {}
      })
    };
  }
};
