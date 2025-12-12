# Order Vision Tracking Query API

## Overview
The Order Vision Tracking Query API provides flexible search capabilities for querying tracking data from the Order Vision document processing pipeline. The API supports multiple search parameters and returns comprehensive tracking information.

## Base URL
```
https://rfw0q0k1l3.execute-api.us-east-2.amazonaws.com/dev
```

## Endpoint
```
GET /tracking/query
```

## Query Parameters

### Primary Search Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `timestamp` | number | Exact Unix timestamp match | `?timestamp=1743732000000` |
| `time` | string/number | Flexible time parameter (Unix timestamp OR ISO 8601) | `?time=2025-03-15T00:00:00.000Z` or `?time=1743732000000` |
| `event_type` | string | Filter by specific event type | `?event_type=upload_started` |
| `status` | string | Filter by event status | `?status=completed` |

### Metadata Search Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `subject` | string | Partial match on email subject | `?subject=Purchase%20Order` |
| `emailId` | string | Exact match on email ID | `?emailId=test@bio-rad.com` |
| `from` | string | Exact match on sender email | `?from=james_malin@bio-rad.com` |
| `createdOn` | string | Exact match on creation date | `?createdOn=2025-10-08T06:23:20.0000000Z` |

### Date Range Parameters

| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `startDate` | string/number | Start of date range | `?startDate=2025-10-01` |
| `endDate` | string/number | End of date range | `?endDate=2025-10-09` |

### Pagination Parameters

| Parameter | Type | Description | Default | Max |
|-----------|------|-------------|---------|-----|
| `limit` | number | Maximum number of results | 50 | 100 |

## Event Types

The following event types are tracked in the system:

- `upload_started` - Upload process initiated
- `upload_completed` - Upload process completed
- `upload_check_started` - Upload validation started
- `upload_check_completed` - Upload validation completed
- `upload_check_failed` - Upload validation failed
- `classification_started` - Document classification started
- `classification_completed` - Document classification completed
- `classification_failed` - Document classification failed
- `processing_started` - Document processing started
- `processing_completed` - Document processing completed
- `processing_failed` - Document processing failed
- `sap_delivery_started` - SAP delivery initiated
- `sap_delivery_completed` - SAP delivery completed
- `sap_delivery_failed` - SAP delivery failed
- `retry` - Retry operation initiated
- `error` - Generic error occurred

## Response Format

### Pipeline Status Response (for timestamp/time queries)
When querying by `timestamp` or `time` parameters, the API returns a comprehensive pipeline status view:

```json
{
  "success": true,
  "pipeline": {
    "timestamp": 1743732000000,
    "status": "in_progress",
    "steps": {
      "upload": {
        "status": "in_progress",
        "events": [
          {
            "event_type": "upload_started",
            "status": "started",
            "event_timestamp": "2025-10-09T17:45:03.544Z",
            "metadata": {
              "from": "james_malin@bio-rad.com",
              "subject": "James Test Async",
              "attachmentCount": 1
            }
          },
          {
            "event_type": "upload_completed",
            "status": "started",
            "event_timestamp": "2025-10-09T17:45:04.206Z"
          }
        ]
      },
      "upload_check": {
        "status": "not_started",
        "events": []
      },
      "classification": {
        "status": "in_progress",
        "events": [
          {
            "event_type": "classification_completed",
            "status": "started",
            "event_timestamp": "2025-10-09T17:47:05.677Z",
            "metadata": {
              "attachmentTypes": [
                {
                  "name": "ABC.PDF",
                  "type": "Supporting Document"
                }
              ],
              "purchaseOrderFound": false
            }
          }
        ]
      },
      "processing": {
        "status": "not_started",
        "events": []
      },
      "sap_delivery": {
        "status": "not_started",
        "events": []
      }
    },
    "metadata": {
      "from": "james_malin@bio-rad.com",
      "subject": "James Test Async",
      "attachmentCount": 1,
      "attachmentTypes": [
        {
          "name": "ABC.PDF",
          "type": "Supporting Document"
        }
      ]
    },
    "summary": {
      "total_steps": 5,
      "completed_steps": 0,
      "failed_steps": 0,
      "current_step": "upload",
      "overall_status": "in_progress"
    }
  },
  "raw_events": [...],
  "query": {
    "timestamp": "1743732000000"
  },
  "event_count": 3
}
```

### Standard List Response (for other queries)
```json
{
  "success": true,
  "count": 3,
  "items": [
    {
      "timestamp": 1743732000000,
      "event_type": "upload_started",
      "status": "started",
      "event_timestamp": "2025-10-09T17:45:03.544Z",
      "environment": "dev",
      "retry_count": 0,
      "ttl": 1767807903,
      "metadata": {
        "emailId": "",
        "from": "james_malin@bio-rad.com",
        "subject": "James Test Async",
        "attachmentCount": 1,
        "attachmentNames": ["ABC.PDF"]
      }
    }
  ],
  "query": {
    "event_type": "upload_started"
  },
  "pagination": {
    "hasMore": false,
    "lastEvaluatedKey": null
  },
  "scannedCount": 3
}
```

### Pipeline Status Fields

#### Step Status Values
- `not_started` - Step has not begun
- `in_progress` - Step is currently running
- `completed` - Step finished successfully
- `failed` - Step failed with errors

#### Overall Status Values
- `not_started` - No steps have begun
- `in_progress` - Pipeline is actively processing
- `waiting` - Waiting for next step to begin
- `completed` - All steps completed successfully
- `failed` - Pipeline failed at some step

### Error Response
```json
{
  "success": false,
  "error": "Invalid time format: invalid-date. Use Unix timestamp or ISO 8601 format.",
  "query": {
    "time": "invalid-date"
  }
}
```

## Example API Calls

### 1. Get All Recent Events
```bash
curl "https://rfw0q0k1l3.execute-api.us-east-2.amazonaws.com/dev/tracking/query"
```

### 2. Search by Exact Timestamp
```bash
curl "https://rfw0q0k1l3.execute-api.us-east-2.amazonaws.com/dev/tracking/query?timestamp=1743732000000"
```

### 3. Search by ISO 8601 Date (Flexible Time Parameter)
```bash
curl "https://rfw0q0k1l3.execute-api.us-east-2.amazonaws.com/dev/tracking/query?time=2025-03-15T00:00:00.000Z"
```

### 4. Filter by Event Type
```bash
curl "https://rfw0q0k1l3.execute-api.us-east-2.amazonaws.com/dev/tracking/query?event_type=upload_started"
```

### 5. Search by Subject (Partial Match)
```bash
curl "https://rfw0q0k1l3.execute-api.us-east-2.amazonaws.com/dev/tracking/query?subject=Purchase%20Order"
```

### 6. Search by Sender Email
```bash
curl "https://rfw0q0k1l3.execute-api.us-east-2.amazonaws.com/dev/tracking/query?from=iqbal_khan@bio-rad.com"
```

### 7. Filter by Status
```bash
curl "https://rfw0q0k1l3.execute-api.us-east-2.amazonaws.com/dev/tracking/query?status=failed"
```

### 8. Date Range Query
```bash
curl "https://rfw0q0k1l3.execute-api.us-east-2.amazonaws.com/dev/tracking/query?startDate=2025-10-01&endDate=2025-10-09"
```

### 9. Combined Search Parameters
```bash
curl "https://rfw0q0k1l3.execute-api.us-east-2.amazonaws.com/dev/tracking/query?status=failed&event_type=processing&limit=10"
```

### 10. Search with Limit
```bash
curl "https://rfw0q0k1l3.execute-api.us-east-2.amazonaws.com/dev/tracking/query?limit=5"
```

## Pipeline Status Examples

### 11. Get Complete Pipeline Status by Timestamp
```bash
curl "https://rfw0q0k1l3.execute-api.us-east-2.amazonaws.com/dev/tracking/query?timestamp=1743732000000"
```

This returns the complete pipeline status showing all 5 steps:
- **upload** → **upload_check** → **classification** → **processing** → **sap_delivery**

### 12. Get Pipeline Status by Flexible Time Parameter
```bash
curl "https://rfw0q0k1l3.execute-api.us-east-2.amazonaws.com/dev/tracking/query?time=2025-03-15T00:00:00.000Z"
```

### 13. Check Pipeline Summary Only
```bash
curl "https://rfw0q0k1l3.execute-api.us-east-2.amazonaws.com/dev/tracking/query?timestamp=1743732000000" | jq '.pipeline.summary'
```

Returns:
```json
{
  "total_steps": 5,
  "completed_steps": 2,
  "failed_steps": 0,
  "current_step": "classification",
  "overall_status": "in_progress"
}
```

### 14. Check Specific Step Status
```bash
curl "https://rfw0q0k1l3.execute-api.us-east-2.amazonaws.com/dev/tracking/query?timestamp=1743732000000" | jq '.pipeline.steps.upload'
```

Returns:
```json
{
  "status": "completed",
  "events": [
    {
      "event_type": "upload_started",
      "status": "started",
      "event_timestamp": "2025-10-09T17:45:03.544Z"
    },
    {
      "event_type": "upload_completed", 
      "status": "completed",
      "event_timestamp": "2025-10-09T17:45:04.206Z"
    }
  ]
}
```

### Pipeline Status Use Cases

1. **Monitor Upload Progress**: Check if files are successfully uploaded and validated
2. **Track Classification Results**: See what document types were identified
3. **Processing Status**: Monitor document processing and extraction progress
4. **SAP Delivery Tracking**: Verify successful delivery to SAP systems
5. **Error Detection**: Identify which step failed and why
6. **Performance Analysis**: Measure processing times between steps
7. **Retry Management**: Track retry attempts and their outcomes

## Query Performance

### Efficient Queries (Use DynamoDB Query operations)
- Exact timestamp searches (`timestamp` or `time` parameters)
- Status-based searches with date ranges (`status` parameter)
- Event type filtering combined with timestamp

### Less Efficient Queries (Use DynamoDB Scan operations)
- Metadata searches (`subject`, `emailId`, `from`, `createdOn`)
- Date range searches without status filter
- Queries without timestamp or status parameters

**Recommendation**: For best performance, use timestamp or status-based queries when possible.

## Error Handling

The API returns appropriate HTTP status codes:

- `200` - Success
- `400` - Bad Request (invalid parameters)
- `500` - Internal Server Error

Common error scenarios:
- Invalid time format in `time` parameter
- Invalid date format in date range parameters
- Missing required environment variables
- DynamoDB access errors

## Rate Limiting

The API uses AWS API Gateway's default rate limiting. For high-volume usage, consider:
- Implementing result caching
- Using more specific query parameters to reduce scan operations
- Batching requests when possible

## CORS Support

The API includes CORS headers for web browser access:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET,OPTIONS`
- `Access-Control-Allow-Headers: Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token`

## Data Retention

- Success records: 90 days (configurable via `SUCCESS_RECORD_TTL_DAYS`)
- Error records: 365 days (configurable via `ERROR_RECORD_TTL_DAYS`)
- Records are automatically deleted by DynamoDB TTL

## Security

The API currently allows public access. For production use, consider:
- Adding API key authentication
- Implementing IAM-based access control
- Adding request signing requirements
- Implementing IP-based restrictions

## Monitoring

Monitor API usage through:
- CloudWatch API Gateway metrics
- Lambda function logs: `/aws/lambda/order-vision-tracking-query-dev`
- DynamoDB metrics for query performance
- Custom CloudWatch dashboards for tracking API usage patterns
