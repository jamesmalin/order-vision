/**
 * Order Vision Tracking Utilities
 * 
 * Helper functions for sending tracking events from existing lambdas
 * to the centralized tracking system.
 */

import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const REGION = process.env.AWS_REGION || 'us-east-2';
const TRACKING_QUEUE_URL = process.env.TRACKING_QUEUE_URL;

const sqsClient = new SQSClient({ region: REGION });

/**
 * Send a tracking event to the tracking system
 * @param {Object} eventData - The tracking event data
 * @returns {Promise<void>}
 */
export async function sendTrackingEvent(eventData) {
  if (!TRACKING_QUEUE_URL) {
    console.warn('TRACKING_QUEUE_URL not configured, skipping tracking event');
    return;
  }

  try {
    const command = new SendMessageCommand({
      QueueUrl: TRACKING_QUEUE_URL,
      MessageBody: JSON.stringify(eventData)
    });
    
    await sqsClient.send(command);
    console.log(`Tracking event sent: ${eventData.timestamp}-${eventData.event_type} (${eventData.status || 'started'})`);
  } catch (error) {
    console.error('Error sending tracking event:', error);
    // Don't fail the main function if tracking fails
  }
}

/**
 * Send upload started event
 * @param {number} timestamp - Upload timestamp
 * @param {Object} metadata - Email metadata
 * @param {Array} attachments - Attachment list
 */
export async function trackUploadStarted(timestamp, metadata, attachments) {
  await sendTrackingEvent({
    timestamp,
    event_type: 'upload',
    status: 'started',
    metadata,
    attachments
  });
}

/**
 * Send upload completed event
 * @param {number} timestamp - Upload timestamp
 * @param {Object} metadata - Email metadata
 * @param {Array} attachments - Attachment list
 */
export async function trackUploadCompleted(timestamp, metadata, attachments) {
  await sendTrackingEvent({
    timestamp,
    event_type: 'upload',
    status: 'completed',
    metadata,
    attachments
  });
}

/**
 * Send upload check started event
 * @param {number} timestamp - Upload timestamp
 */
export async function trackUploadCheckStarted(timestamp) {
  await sendTrackingEvent({
    timestamp,
    event_type: 'upload_check',
    status: 'started'
  });
}

/**
 * Send upload check completed event
 * @param {number} timestamp - Upload timestamp
 * @param {Array} attachments - Validated attachment list
 */
export async function trackUploadCheckCompleted(timestamp, attachments) {
  await sendTrackingEvent({
    timestamp,
    event_type: 'upload_check',
    status: 'completed',
    attachments
  });
}

/**
 * Send upload check failed event
 * @param {number} timestamp - Upload timestamp
 * @param {Object} error - Error details
 * @param {Array} missingFiles - List of missing files
 */
export async function trackUploadCheckFailed(timestamp, error, missingFiles = []) {
  await sendTrackingEvent({
    timestamp,
    event_type: 'upload_check',
    status: 'failed',
    error_details: {
      message: error.message || 'Upload check failed',
      code: error.code || 'UPLOAD_CHECK_ERROR',
      missing_files: missingFiles
    }
  });
}

/**
 * Send classification started event
 * @param {number} timestamp - Upload timestamp
 * @param {Array} attachments - Attachment list to classify
 */
export async function trackClassificationStarted(timestamp, attachments) {
  await sendTrackingEvent({
    timestamp,
    event_type: 'classification',
    status: 'started',
    attachments
  });
}

/**
 * Send classification completed event
 * @param {number} timestamp - Upload timestamp
 * @param {Array} attachments - Classified attachment list
 * @param {number} processingDuration - Processing time in milliseconds
 */
export async function trackClassificationCompleted(timestamp, attachments, processingDuration) {
  await sendTrackingEvent({
    timestamp,
    event_type: 'classification',
    status: 'completed',
    attachments,
    processing_duration: processingDuration,
    classification_result: {
      classified_count: attachments.filter(a => a.Type).length,
      total_count: attachments.length
    }
  });
}

/**
 * Send classification failed event
 * @param {number} timestamp - Upload timestamp
 * @param {Object} error - Error details
 * @param {number} retryCount - Current retry count
 */
export async function trackClassificationFailed(timestamp, error, retryCount = 0) {
  await sendTrackingEvent({
    timestamp,
    event_type: 'classification',
    status: 'failed',
    error_details: {
      message: error.message || 'Classification failed',
      code: error.code || 'CLASSIFICATION_ERROR',
      stack: error.stack
    },
    retry_count: retryCount
  });
}

/**
 * Send processing started event for individual file
 * @param {number} timestamp - Upload timestamp
 * @param {string} fileKey - S3 file key
 * @param {string} fileType - Classified file type
 */
export async function trackProcessingStarted(timestamp, fileKey, fileType) {
  await sendTrackingEvent({
    timestamp,
    event_type: 'processing',
    status: 'started',
    file_key: fileKey,
    classification_result: { type: fileType }
  });
}

/**
 * Send processing completed event for individual file
 * @param {number} timestamp - Upload timestamp
 * @param {string} fileKey - S3 file key
 * @param {Object} processingResult - Processing results
 * @param {number} processingDuration - Processing time in milliseconds
 */
export async function trackProcessingCompleted(timestamp, fileKey, processingResult, processingDuration) {
  await sendTrackingEvent({
    timestamp,
    event_type: 'processing',
    status: 'completed',
    file_key: fileKey,
    processing_duration: processingDuration,
    classification_result: processingResult
  });
}

/**
 * Send processing failed event for individual file
 * @param {number} timestamp - Upload timestamp
 * @param {string} fileKey - S3 file key
 * @param {Object} error - Error details
 * @param {number} retryCount - Current retry count
 */
export async function trackProcessingFailed(timestamp, fileKey, error, retryCount = 0) {
  await sendTrackingEvent({
    timestamp,
    event_type: 'processing',
    status: 'failed',
    file_key: fileKey,
    error_details: {
      message: error.message || 'Processing failed',
      code: error.code || 'PROCESSING_ERROR',
      stack: error.stack
    },
    retry_count: retryCount
  });
}

/**
 * Send SAP delivery started event
 * @param {number} timestamp - Upload timestamp
 * @param {Object} metadata - Email metadata
 * @param {Object} sapPayload - SAP delivery payload
 */
export async function trackSAPDeliveryStarted(timestamp, metadata, sapPayload) {
  await sendTrackingEvent({
    timestamp,
    event_type: 'sap_delivery_started',
    status: 'started',
    metadata,
    sap_response: { payload: sapPayload }
  });
}

/**
 * Send SAP delivery completed event
 * @param {number} timestamp - Upload timestamp
 * @param {Object} metadata - Email metadata
 * @param {Object} sapResponse - SAP response
 */
export async function trackSAPDeliveryCompleted(timestamp, metadata, sapResponse) {
  await sendTrackingEvent({
    timestamp,
    event_type: 'sap_delivery_completed',
    status: 'completed',
    metadata,
    sap_response: sapResponse
  });
}

/**
 * Send SAP delivery failed event
 * @param {number} timestamp - Upload timestamp
 * @param {Object} metadata - Email metadata
 * @param {string} errorMessage - Error message
 */
export async function trackSAPDeliveryFailed(timestamp, metadata, errorMessage) {
  await sendTrackingEvent({
    timestamp,
    event_type: 'sap_delivery_failed',
    status: 'failed',
    metadata,
    error_details: {
      message: errorMessage || 'SAP delivery failed',
      code: 'SAP_DELIVERY_ERROR'
    }
  });
}

/**
 * Send retry event
 * @param {number} timestamp - Upload timestamp
 * @param {string} eventType - Original event type being retried
 * @param {string} fileKey - S3 file key (optional)
 * @param {number} retryCount - Current retry count
 * @param {Object} error - Original error that caused retry
 */
export async function trackRetry(timestamp, eventType, fileKey, retryCount, error) {
  await sendTrackingEvent({
    timestamp,
    event_type: 'retry',
    status: 'started',
    file_key: fileKey,
    retry_count: retryCount,
    error_details: {
      original_event_type: eventType,
      message: error.message || 'Retry initiated',
      code: error.code || 'RETRY',
      stack: error.stack
    }
  });
}

/**
 * Send generic error event
 * @param {number} timestamp - Upload timestamp
 * @param {string} eventType - Event type where error occurred
 * @param {Object} error - Error details
 * @param {string} fileKey - S3 file key (optional)
 */
export async function trackError(timestamp, eventType, error, fileKey = null) {
  await sendTrackingEvent({
    timestamp,
    event_type: 'error',
    status: 'failed',
    file_key: fileKey,
    error_details: {
      event_type: eventType,
      message: error.message || 'Unknown error',
      code: error.code || 'UNKNOWN_ERROR',
      stack: error.stack
    }
  });
}

/**
 * Update existing tracking record
 * @param {number} timestamp - Upload timestamp
 * @param {string} eventType - Event type to update
 * @param {Object} updates - Fields to update
 */
export async function updateTrackingRecord(timestamp, eventType, updates) {
  await sendTrackingEvent({
    action: 'update',
    timestamp,
    event_type: eventType,
    updates
  });
}

/**
 * Get processing timeline for a timestamp
 * @param {number} timestamp - Upload timestamp
 */
export async function getProcessingTimeline(timestamp) {
  await sendTrackingEvent({
    action: 'get_timeline',
    timestamp
  });
}

/**
 * Helper to extract timestamp from various sources
 * @param {Object} metadata - Email metadata object
 * @returns {number} - Timestamp
 */
export function extractTimestamp(metadata) {
  if (metadata.CreatedOn) {
    return new Date(metadata.CreatedOn).getTime();
  }
  if (metadata.timestamp) {
    return parseInt(metadata.timestamp);
  }
  return Date.now();
}

/**
 * Helper to measure processing duration
 * @returns {Function} - Function to call when processing is complete
 */
export function startTimer() {
  const startTime = Date.now();
  return () => Date.now() - startTime;
}

// Export all functions as default for easy importing
export default {
  sendTrackingEvent,
  trackUploadStarted,
  trackUploadCompleted,
  trackUploadCheckStarted,
  trackUploadCheckCompleted,
  trackUploadCheckFailed,
  trackClassificationStarted,
  trackClassificationCompleted,
  trackClassificationFailed,
  trackProcessingStarted,
  trackProcessingCompleted,
  trackProcessingFailed,
  trackSAPDeliveryStarted,
  trackSAPDeliveryCompleted,
  trackSAPDeliveryFailed,
  trackRetry,
  trackError,
  updateTrackingRecord,
  getProcessingTimeline,
  extractTimestamp,
  startTimer
};
