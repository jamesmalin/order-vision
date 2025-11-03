import { findRRC } from "./rrc-number.mjs";

// Test cases for the findRRC function
const testCases = [
    "3000215379",           // Basic case
    "ABC3000215379",        // Prefix case
    "3000215379DEF",        // Suffix case
    "ABC3000215379DEF",     // Both prefix and suffix
    "Some text 3000123456 more text", // Embedded in text
    "3000",                 // Too short
    "30001234567",          // Too long
    "4000215379",           // Wrong starting digits
    "No RRC here",          // No RRC
    "1\nD10 Dual Programme HbA2 Kit\n3822\n400\n6.00\nKit\n34000.00\n204000.\n12.00\n24480.0\n228480.00\n(RRC3000215379)\nTest\n00\n0",        // RRC prefix
    "",                     // Empty string
    null,                   // Null input
    "Multiple 3000111111 and 3000222222 RRCs" // Multiple RRCs (should return first)
];

console.log("Testing findRRC function:");
console.log("========================");

testCases.forEach((testCase, index) => {
    const result = findRRC(testCase);
    console.log(`Test ${index + 1}: "${testCase}" => "${result}"`);
});
