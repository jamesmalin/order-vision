import { findRRC } from "./rrc-number.mjs";

// Test cases for the updated findRRC function that returns arrays
const testCases = [
    "3000215379",           // Single RRC
    "ABC3000215379",        // Single RRC with prefix
    "3000215379DEF",        // Single RRC with suffix
    "ABC3000215379DEF",     // Single RRC with both prefix and suffix
    "Multiple 3000111111 and 3000222222 RRCs", // Multiple RRCs
    "3000111111 text 3000222222 more 3000333333", // Three RRCs
    "3000",                 // Too short
    "30001234567",          // Too long (should extract 3000123456)
    "4000215379",           // Wrong starting digits
    "No RRC here",          // No RRC
    "",                     // Empty string
    null,                   // Null input
    "Start 3000111111 middle 3000222222 end 3000333333 finish" // Multiple with text
];

console.log("Testing updated findRRC function (returns arrays):");
console.log("=================================================");

testCases.forEach((testCase, index) => {
    const result = findRRC(testCase);
    console.log(`Test ${index + 1}: "${testCase}"`);
    console.log(`  Result: [${result.map(r => `"${r}"`).join(', ')}]`);
    console.log(`  Count: ${result.length}`);
    console.log();
});
