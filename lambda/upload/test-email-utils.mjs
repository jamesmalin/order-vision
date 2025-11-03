import { normalizeEmailField, normalizeEmailObject } from './email-utils.mjs';

// Test cases based on the examples provided
const testCases = [
  // Already correct format
  {
    input: {
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
    },
    expected: {
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
    }
  },
  // String format that needs normalization
  {
    input: {
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
        },
        {
          "AttachmentName": "MailPdf20250603 015843.pdf"
        }
      ]
    },
    expected: {
      "CreatedOn": "2025-06-03T17:57:27.0000000Z",
      "EmailId": "",
      "Subject": "test4",
      "From": "Raghavendra-Prakash_Sureddi@bio-rad.com",
      "To": ["dev.Customer.service.cn@bio-rad.com"],
      "Cc": [],
      "Body": "",
      "Attachments": [
        {
          "AttachmentName": "henryschine.pdf"
        },
        {
          "AttachmentName": "MailPdf20250603 015843.pdf"
        }
      ]
    }
  }
];

// Additional test cases for edge cases
const edgeCases = [
  // Comma and semicolon separated
  {
    input: "<alice@x.com>;<bob@x.com>,<charlie@x.com>",
    expected: ["alice@x.com", "bob@x.com", "charlie@x.com"]
  },
  // Single email without brackets
  {
    input: "test@example.com",
    expected: ["test@example.com"]
  },
  // Empty string
  {
    input: "",
    expected: []
  },
  // Null/undefined
  {
    input: null,
    expected: []
  },
  {
    input: undefined,
    expected: []
  },
  // Already an array
  {
    input: ["test1@example.com", "test2@example.com"],
    expected: ["test1@example.com", "test2@example.com"]
  },
  // Mixed separators with spaces
  {
    input: " <alice@x.com> ; <bob@x.com> , <charlie@x.com> ",
    expected: ["alice@x.com", "bob@x.com", "charlie@x.com"]
  }
];

console.log("Testing normalizeEmailObject function:");
console.log("=====================================");

testCases.forEach((testCase, index) => {
  const result = normalizeEmailObject(testCase.input);
  const passed = JSON.stringify(result.To) === JSON.stringify(testCase.expected.To) && 
                 JSON.stringify(result.Cc) === JSON.stringify(testCase.expected.Cc);
  
  console.log(`Test Case ${index + 1}: ${passed ? 'PASSED' : 'FAILED'}`);
  if (!passed) {
    console.log('Expected To:', testCase.expected.To);
    console.log('Actual To:', result.To);
    console.log('Expected Cc:', testCase.expected.Cc);
    console.log('Actual Cc:', result.Cc);
  }
  console.log('---');
});

console.log("\nTesting normalizeEmailField function:");
console.log("====================================");

edgeCases.forEach((testCase, index) => {
  const result = normalizeEmailField(testCase.input);
  const passed = JSON.stringify(result) === JSON.stringify(testCase.expected);
  
  console.log(`Edge Case ${index + 1}: ${passed ? 'PASSED' : 'FAILED'}`);
  console.log(`Input: ${JSON.stringify(testCase.input)}`);
  console.log(`Expected: ${JSON.stringify(testCase.expected)}`);
  console.log(`Actual: ${JSON.stringify(result)}`);
  console.log('---');
});
