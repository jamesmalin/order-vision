# Multi-PO Support Implementation

## Status: Implementation Complete - Ready for Testing
**Developer**: AI Assistant
**Started**: 2025-11-03
**Completed**: 2025-11-03
**Branch**: feature/multi-po-support

## Description
Enable the Order Vision AI system to process multiple Purchase Orders from a single email submission. Currently, the system only processes the first PO found in an email's attachments. This enhancement will allow processing of all PO attachments while maintaining proper tracking, avoiding API rate limits, and ensuring each PO is sent to SAP independently.

## Background

### Current Flow
```
upload → upload-check → classification → start-processing
         (direct)       (direct Lambda)  (direct Lambda - ONCE)
                                          invoke
```

### Current Limitation
In `lambda/classification/index.mjs` (lines ~282-315), the system:
1. Finds the first Purchase Order attachment
2. Invokes `start-processing` lambda **once** for that PO
3. Ignores any additional PO attachments

### Key Findings
- **No SQS queue** between classification and start-processing (direct Lambda invocation)
- **Async invocation** already used (`InvocationType: 'Event'`)
- **All metadata available** - RRC numbers, supporting docs, customer inquiry info
- **Tracking system** uses SQS but only for event logging, not processing flow

## Requirements

### Functional Requirements
- [x] Identify all Purchase Order attachments in classification lambda
- [ ] Invoke start-processing lambda for each PO (not just the first)
- [ ] Implement controlled concurrency to avoid overwhelming external APIs
- [ ] Ensure each PO gets proper tracking events
- [ ] Generate unique output files for each PO to avoid S3 conflicts
- [ ] Share RRC numbers and supporting document info across all POs
- [ ] Maintain backward compatibility with single-PO scenarios

### Technical Requirements
- [ ] Add `MAX_CONCURRENT_POS` environment variable (default: 2)
- [ ] Implement batch processing with configurable concurrency
- [ ] Add `currentPO` parameter to event payload for PO identification
- [ ] Update S3 file naming: `processed-{sanitizedPOName}.json`
- [ ] Add inter-batch delay option (2 seconds) to reduce API pressure
- [ ] Implement proper error handling for partial failures
- [ ] Log batch processing metrics

### Non-Functional Requirements
- [ ] Respect Azure Document Intelligence API rate limits
- [ ] Respect OpenAI API rate limits
- [ ] Maintain existing tracking system integration
- [ ] Ensure each PO is sent to SAP independently
- [ ] No breaking changes to existing single-PO functionality

## Acceptance Criteria

### Core Functionality
- [ ] System processes all PO attachments from a single email
- [ ] Each PO generates its own `processed-{POname}.json` file
- [ ] Each PO is sent to SAP independently
- [ ] RRC numbers from customer inquiry/supporting docs are shared across all POs
- [ ] Tracking events are generated for each PO individually

### Concurrency Control
- [ ] No more than `MAX_CONCURRENT_POS` lambdas run simultaneously
- [ ] Batch processing completes successfully with 2, 3, 4, and 5+ POs
- [ ] Optional inter-batch delay can be configured

### Error Handling
- [ ] If one PO fails to invoke, others still process
- [ ] Failed PO invocations trigger alerts
- [ ] Success/failure metrics are logged for each batch
- [ ] Partial failures don't block successful POs

### Backward Compatibility
- [ ] Single-PO emails continue to work as before
- [ ] Existing tracking system integration remains functional
- [ ] No changes required to upload or upload-check lambdas

## Technical Implementation

### 1. Classification Lambda Changes (`lambda/classification/index.mjs`)

**Location**: Lines ~282-315

**Current Code**:
```javascript
if (purchaseOrderAttachment) {
    // Process purchase order (invokes start-processing ONCE)
}
```

**New Implementation**:
```javascript
// Configuration for max concurrent PO processing
const MAX_CONCURRENT_POS = parseInt(process.env.MAX_CONCURRENT_POS || '2');

// Find ALL Purchase Order attachments
const purchaseOrderAttachments = event.metadata.Attachments.filter(
    attachment => attachment.Type === "Purchase Order"
);

if (purchaseOrderAttachments.length > 0) {
    console.log(`Found ${purchaseOrderAttachments.length} Purchase Order(s) - processing with max concurrency of ${MAX_CONCURRENT_POS}`);
    
    // Collect RRC numbers once (shared across all POs)
    const allRrcNumbers = [];
    event.metadata.Attachments.forEach(attachment => {
        if ((attachment.Type === "Customer Inquiry" || attachment.Type === "Supporting Document") && attachment.RRC) {
            allRrcNumbers.push(...attachment.RRC);
        }
    });
    
    const uniqueRrcNumbers = allRrcNumbers.length > 0 ? [...new Set(allRrcNumbers)] : [];
    if (uniqueRrcNumbers.length > 0) {
        console.log(`RRC numbers to be added to all POs: ${uniqueRrcNumbers.join(', ')}`);
    }
    
    // Helper function to invoke start-processing for a single PO
    const invokePO = async (poAttachment) => {
        console.log(`Invoking start-processing for PO: ${poAttachment.AttachmentName}`);
        
        // Track processing started for this specific PO
        await trackProcessingStarted(event.timestamp, event.metadata);
        
        // Create event payload for this specific PO
        const poEvent = {
            ...event,
            currentPO: poAttachment.AttachmentName
        };
        
        // Add RRC numbers if any were found
        if (uniqueRrcNumbers.length > 0) {
            poEvent.RRC = uniqueRrcNumbers;
        }
        
        // Invoke Lambda asynchronously with retry mechanism
        const invokeCommand = new InvokeCommand({
            FunctionName: LAMBDA_FUNCTION_NAME,
            Payload: Buffer.from(JSON.stringify(poEvent)),
            InvocationType: 'Event'  // Async invocation
        });
        
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const resp = await lambdaClient.send(invokeCommand);
                console.log(`Async invoke succeeded for ${poAttachment.AttachmentName} on attempt ${attempt}`);
                return { success: true, po: poAttachment.AttachmentName };
            } catch (err) {
                console.warn(`Invoke attempt ${attempt} failed for ${poAttachment.AttachmentName}:`, err);
                if (attempt === maxRetries) {
                    console.error(`All retries failed for ${poAttachment.AttachmentName}`);
                    await sendAlert({
                        message: `Classification failed: Unable to invoke ${LAMBDA_FUNCTION_NAME} for PO ${poAttachment.AttachmentName} after ${maxRetries} attempts. Timestamp: ${event.timestamp}, Error: ${err.message}`
                    });
                    return { success: false, po: poAttachment.AttachmentName, error: err.message };
                }
            }
        }
    };
    
    // Process POs in batches with controlled concurrency
    const results = [];
    for (let i = 0; i < purchaseOrderAttachments.length; i += MAX_CONCURRENT_POS) {
        const batch = purchaseOrderAttachments.slice(i, i + MAX_CONCURRENT_POS);
        console.log(`Processing batch ${Math.floor(i / MAX_CONCURRENT_POS) + 1}: ${batch.map(po => po.AttachmentName).join(', ')}`);
        
        const batchResults = await Promise.allSettled(
            batch.map(po => invokePO(po))
        );
        
        results.push(...batchResults);
        
        // Optional: Add a small delay between batches to further reduce API pressure
        if (i + MAX_CONCURRENT_POS < purchaseOrderAttachments.length) {
            console.log('Waiting 2 seconds before next batch...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    // Log results
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
    
    console.log(`PO processing invocations: ${successful} successful, ${failed} failed out of ${purchaseOrderAttachments.length} total`);
    
    // If any failed, alert but don't throw (since some succeeded)
    if (failed > 0) {
        await sendAlert({
            message: `Classification completed with ${failed} failed PO invocations out of ${purchaseOrderAttachments.length}. Timestamp: ${event.timestamp}`
        });
    }
}
```

### 2. Start-Processing Lambda Changes (`lambda/start-processing/index.mjs`)

**Location**: Lines ~1089-1115

**Current Code**:
```javascript
// Select the first attachment that has .Type of "Purchase Order"
const purchaseOrderAttachment = event.metadata.Attachments.find(attachment =>
    attachment.Type === "Purchase Order"
);
```

**New Implementation**:
```javascript
// If currentPO is specified, use that specific PO; otherwise fall back to first PO
let purchaseOrderAttachment;
if (event.currentPO) {
    purchaseOrderAttachment = event.metadata.Attachments.find(attachment =>
        attachment.Type === "Purchase Order" && attachment.AttachmentName === event.currentPO
    );
    console.log(`Processing specific PO: ${event.currentPO}`);
} else {
    // Fallback to first PO for backward compatibility
    purchaseOrderAttachment = event.metadata.Attachments.find(attachment =>
        attachment.Type === "Purchase Order"
    );
    console.log(`Processing first PO found (backward compatibility mode)`);
}
```

### 3. S3 File Naming Changes (`lambda/start-processing/index.mjs`)

**Location**: Lines ~1850-1870

**Current Code**:
```javascript
const processedFileKey = `uploads/${event.timestamp}/processed.json`;
```

**New Implementation**:
```javascript
// Generate unique filename for each PO to avoid conflicts
const sanitizedPOName = attachmentName.replace(/[^a-zA-Z0-9]/g, '_');
const processedFileKey = `uploads/${event.timestamp}/processed-${sanitizedPOName}.json`;
```

### 4. Environment Variable Configuration

Add to Lambda environment variables:
```
MAX_CONCURRENT_POS=2
```

**Tuning Recommendations**:
- Start with `2` (conservative, safe for API limits)
- Monitor Azure/OpenAI API usage
- Increase to `3-4` if APIs handle load well
- Never exceed `5` to maintain system stability

## Progress

### Phase 1: Planning & Documentation ✅
- [x] Analyze current flow
- [x] Identify single-PO limitation
- [x] Design multi-PO solution
- [x] Create task documentation

### Phase 2: Implementation ✅
- [x] Update classification lambda with batch processing logic
- [x] Update start-processing lambda with PO selection logic
- [x] Update S3 file naming logic
- [x] Create test event for multi-PO scenario
- [x] Create deployment guide (DEPLOYMENT.md)
- [ ] Add MAX_CONCURRENT_POS environment variable (deployment step)

### Phase 3: Testing
- [ ] Test with 2 POs in single email
- [ ] Test with 3+ POs in single email
- [ ] Test with single PO (backward compatibility)
- [ ] Test with failed PO invocation (error handling)
- [ ] Verify tracking events for each PO
- [ ] Verify SAP delivery for each PO
- [ ] Verify S3 file generation for each PO
- [ ] Monitor CloudWatch logs for batch processing

### Phase 4: Deployment
- [ ] Deploy to dev environment
- [ ] Validate in dev with test emails
- [ ] Deploy to staging/QA
- [ ] Validate in staging
- [ ] Deploy to production
- [ ] Monitor production metrics

## Testing Strategy

### Test Scenarios

#### Scenario 1: Two POs
- Email with 2 PO attachments
- Expected: Both POs processed, 2 processed-*.json files created, 2 SAP deliveries

#### Scenario 2: Three POs
- Email with 3 PO attachments
- Expected: All 3 POs processed in batches (2 + 1), 3 processed-*.json files, 3 SAP deliveries

#### Scenario 3: Single PO (Backward Compatibility)
- Email with 1 PO attachment
- Expected: Single PO processed as before, backward compatible behavior

#### Scenario 4: POs with RRC Numbers
- Email with 2 POs + 1 Customer Inquiry (with RRC)
- Expected: Both POs receive the RRC numbers, proper tracking

#### Scenario 5: Partial Failure
- Simulate one PO invocation failure
- Expected: Other POs still process, alert generated, metrics logged

### Test Data Requirements
- Sample emails with multiple PO attachments
- Sample customer inquiry with RRC numbers
- Sample supporting documents

## Dependencies

### External APIs
- Azure Document Intelligence (rate limits apply)
- OpenAI API (rate limits apply)
- SAP PI API (each PO sent independently)

### Internal Systems
- Tracking system (SQS + DynamoDB)
- S3 bucket for file storage
- CloudWatch for logging and alerts

### Configuration
- Lambda environment variables
- Lambda timeout settings (may need adjustment for batch processing)
- Lambda memory settings (monitor for batch processing)

## Risks & Mitigation

### Risk 1: API Rate Limits
**Risk**: Processing multiple POs simultaneously may exceed Azure/OpenAI rate limits
**Mitigation**: Controlled concurrency with MAX_CONCURRENT_POS, inter-batch delays

### Risk 2: Lambda Timeout
**Risk**: Batch processing may exceed Lambda timeout
**Mitigation**: Async invocation means classification lambda returns quickly, start-processing runs independently

### Risk 3: S3 File Conflicts
**Risk**: Multiple POs writing to same filename
**Mitigation**: Unique filenames using sanitized PO attachment names

### Risk 4: Partial Failures
**Risk**: Some POs succeed while others fail
**Mitigation**: Promise.allSettled for independent processing, proper error logging and alerts

### Risk 5: Tracking Complexity
**Risk**: Tracking events may be confusing with multiple POs
**Mitigation**: Each PO gets its own tracking events with proper identification

## Performance Considerations

### Expected Behavior
- **2 POs**: Process in parallel (batch 1)
- **3 POs**: Batch 1 (2 POs) → wait 2s → Batch 2 (1 PO)
- **5 POs**: Batch 1 (2 POs) → wait 2s → Batch 2 (2 POs) → wait 2s → Batch 3 (1 PO)

### Monitoring Metrics
- Batch processing duration
- Success/failure rates per batch
- API call patterns to Azure/OpenAI
- S3 file creation success rates
- SAP delivery success rates

## Notes

### Design Decisions
1. **Batch processing over pure parallel**: Protects external APIs from overload
2. **Configurable concurrency**: Allows tuning based on actual API performance
3. **Async invocation**: Classification lambda doesn't wait for processing to complete
4. **Unique file naming**: Prevents race conditions and file overwrites
5. **Shared metadata**: RRC numbers and supporting docs available to all POs

### Future Enhancements
- [ ] Dynamic concurrency adjustment based on API response times
- [ ] Retry logic for failed PO processing (not just invocation)
- [ ] Consolidated reporting for multi-PO emails
- [ ] Dashboard for multi-PO processing metrics

### Related Documentation
- `lambda/classification/README.md` - Classification lambda documentation
- `lambda/start-processing/README.md` - Start-processing lambda documentation
- `lambda/tracking/README.md` - Tracking system documentation

## Blockers
None currently identified.

## Next Steps
1. Review and approve this implementation plan
2. Create feature branch: `feature/multi-po-support`
3. Implement classification lambda changes
4. Implement start-processing lambda changes
5. Add environment variable configuration
6. Begin testing with sample multi-PO events
