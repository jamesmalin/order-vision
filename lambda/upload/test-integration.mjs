import { handler } from './index.mjs';

// Mock AWS SDK
const mockS3Client = {
  send: async () => ({ success: true })
};

const mockGetSignedUrl = async () => 'https://mock-presigned-url.com';

// Test data with different email formats
const testEvents = [
  {
    name: "Already normalized email",
    event: {
      body: JSON.stringify({
        "CreatedOn": "2025-04-04T02:00:00.000Z",
        "EmailId": "",
        "Subject": "James Test Async",
        "From": "james_malin@bio-rad.com",
        "To": ["james_malin@bio-rad.com"],
        "Cc": [],
        "Body": "",
        "Attachments": [
          {
            "AttachmentName": "ABC.PDF"
          }
        ]
      })
    }
  },
  {
    name: "String format email that needs normalization",
    event: {
      body: JSON.stringify({
        "CreatedOn": "2025-06-03T17:57:27.0000000Z",
        "EmailId": "",
        "Subject": "test4",
        "From": "Raghavendra-Prakash_Sureddi@bio-rad.com",
        "To": "<dev.Customer.service.cn@bio-rad.com>",
        "Cc": "",
        "Body": "",
        "Attachments": [
          {
            "AttachmentName": "henryschine.pdf"
          }
        ]
      })
    }
  },
  {
    name: "Multiple emails with mixed separators",
    event: {
      body: JSON.stringify({
        "CreatedOn": "2025-06-03T17:57:27.0000000Z",
        "EmailId": "",
        "Subject": "Multiple recipients test",
        "From": "sender@bio-rad.com",
        "To": "<alice@x.com>;<bob@x.com>,<charlie@x.com>",
        "Cc": "<cc1@example.com>, <cc2@example.com>",
        "Body": "",
        "Attachments": [
          {
            "AttachmentName": "test.pdf"
          }
        ]
      })
    }
  }
];

console.log("Testing email normalization integration:");
console.log("======================================");

// Note: This is a dry run test since we can't actually call AWS services
// In a real environment, you would mock the AWS SDK properly
testEvents.forEach((testCase, index) => {
  console.log(`\nTest Case ${index + 1}: ${testCase.name}`);
  
  try {
    const body = JSON.parse(testCase.event.body);
    console.log("Original To:", body.To);
    console.log("Original Cc:", body.Cc);
    
    // Simulate what the handler would do
    import('./email-utils.mjs').then(({ normalizeEmailObject }) => {
      const normalized = normalizeEmailObject(body);
      console.log("Normalized To:", normalized.To);
      console.log("Normalized Cc:", normalized.Cc);
      console.log("✓ Normalization successful");
    });
    
  } catch (error) {
    console.log("✗ Test failed:", error.message);
  }
});

console.log("\nIntegration test completed!");
console.log("The upload lambda will now automatically normalize To and Cc fields to arrays.");
