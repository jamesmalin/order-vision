# QA Missing Environment Variables - Impact Analysis

Generated: 2025-11-23

---

## Executive Summary

The QA environment is missing several environment variables that are present in DEV. However, **all missing variables have graceful fallbacks in the code**, meaning **nothing will break** - the functions will continue to work, but with reduced functionality.

---

## Detailed Analysis

### 1. TRACKING_QUEUE_URL (Missing in 4 QA functions)

**Missing in:**
- order-vision-upload (QA)
- order-vision-upload-check (QA)
- order-vision-classification (QA)
- order-vision-start-processing (QA)

**Code Implementation:**
```javascript
const TRACKING_QUEUE_URL = process.env.TRACKING_QUEUE_URL;

export async function sendTrackingEvent(eventData) {
  if (!TRACKING_QUEUE_URL) {
    console.warn('TRACKING_QUEUE_URL not configured, skipping tracking event');
    return;  // Gracefully exits without error
  }
  // ... send tracking event
}
```

**Impact:**
- ✅ **No Breaking Issues** - Code has explicit check and graceful fallback
- ⚠️ **Reduced Functionality:**
  - Tracking events will NOT be sent to the tracking system
  - No centralized monitoring/status updates in QA
  - Console will show: "TRACKING_QUEUE_URL not configured, skipping tracking event"
  - Processing will continue normally

**Why This Matters:**
- The tracking system is used for monitoring and debugging
- Without it, you lose visibility into:
  - Upload status
  - Classification progress
  - Processing status
  - Error tracking
  - Timeline of events

**Recommendation:**
- ✅ **Safe to leave as-is if tracking system doesn't exist in QA**
- If you want tracking in QA, you would need to:
  1. Deploy the tracking infrastructure to QA
  2. Add the TRACKING_QUEUE_URL to all 4 functions

---

### 2. REGION (Missing in order-vision-upload-check QA)

**Code Implementation:**
```javascript
const REGION = process.env.REGION || 'us-east-2';
const s3Client = new S3Client({ region: REGION });
const lambdaClient = new LambdaClient({ region: REGION });
```

**Impact:**
- ✅ **No Breaking Issues** - Has default fallback to 'us-east-2'
- ✅ **No Functional Impact** - Will use the correct region (us-east-2) by default

**Recommendation:**
- ✅ **Safe to leave as-is** - The default value is correct
- Optional: Add explicitly for consistency and clarity

---

### 3. MAX_CONCURRENT_POS (Missing in order-vision-classification QA)

**Code Implementation:**
```javascript
const MAX_CONCURRENT_POS = parseInt(process.env.MAX_CONCURRENT_POS || '2');
```

**Impact:**
- ✅ **No Breaking Issues** - Has default fallback to 2
- ✅ **No Functional Impact** - Will process 2 POs concurrently (same as DEV)

**Recommendation:**
- ✅ **Safe to leave as-is** - The default value matches DEV configuration
- Optional: Add explicitly for consistency

---

## Summary Table

| Variable | Functions Missing | Has Fallback? | Default Value | Breaks Code? | Impact |
|----------|------------------|---------------|---------------|--------------|---------|
| TRACKING_QUEUE_URL | 4 functions | ✅ Yes | Skip tracking | ❌ No | No tracking events sent |
| REGION | upload-check | ✅ Yes | 'us-east-2' | ❌ No | None - uses correct default |
| MAX_CONCURRENT_POS | classification | ✅ Yes | '2' | ❌ No | None - uses correct default |

---

## Conclusion

### Will Anything Break? **NO** ❌

All missing environment variables have proper fallbacks in the code:
- **TRACKING_QUEUE_URL**: Gracefully skips tracking with console warning
- **REGION**: Defaults to correct value ('us-east-2')
- **MAX_CONCURRENT_POS**: Defaults to correct value (2)

### What You Lose in QA:

**Only Loss: Tracking/Monitoring Capability**
- No centralized tracking events
- No visibility into processing pipeline status
- No error tracking in the tracking system
- Must rely on CloudWatch logs for debugging

### Recommendations:

1. **If tracking system doesn't exist in QA:**
   - ✅ Leave as-is - everything will work fine
   - The warnings in logs are informational only

2. **If you want tracking in QA:**
   - Deploy tracking infrastructure to QA
   - Add TRACKING_QUEUE_URL to all 4 functions
   - Update to QA-specific queue URL

3. **Optional improvements for clarity:**
   - Add REGION to upload-check (QA) - though not required
   - Add MAX_CONCURRENT_POS to classification (QA) - though not required

---

## NAMESPACE Updates Completed ✅

All environments now use `address_v8_prod_adrc`:
- ✅ PROD classification: v8
- ✅ PROD start-processing: v8
- ✅ DEV classification: v8 (UPDATED)
- ✅ DEV start-processing: v8
- ✅ QA classification: v8 (UPDATED)
- ✅ QA start-processing: v8 (UPDATED)
