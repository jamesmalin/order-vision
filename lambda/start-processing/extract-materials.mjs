// extractMatches.mjs

// Define the regex pattern
// const pattern = /^[A-Z0-9]+(?:[\s\n]\d+)+/;
// const pattern = /^(?:[A-Z0-9]+(?:[\s\n]\d+)+|\d+(?:[\s\n][A-Z0-9]+)+)(?=\s|$)/;
// const pattern = /^(?:[A-Z0-9]+(?:[\s\n]\d+)+|\d+(?:[\s\n][A-Z0-9]+)+|\d+)(?=\s|$)/;
// const pattern = /(?:[A-Z0-9]+(?:[\s\n]\d+)+|\d+(?:[\s\n][A-Z0-9]+)+|\d+)(?=\s|$)/;

// const pattern = /(?:[A-Z0-9]+(?:[\s\n]\d+)+|\d+(?:[\s\n][A-Z0-9]+)+|[A-Z0-9]+)(?=\s|$)/; // Feb 4 2025
// const pattern = /(?:[A-Z0-9]+(?:[\s\n]\d+)+|\d+(?:[\s\n][A-Z0-9]+)+|[A-Z0-9]+|\d+)(?=\s|$)/; // Feb 6, 2025
const pattern = /(?<![^\s\w-])\b(?:[A-Z0-9]+-[A-Z0-9]+|[A-Z]*[0-9]{3,}[A-Z0-9]*)\b(?![^\s\w-])/g;
// "配合交貨,待通\n0001\n68-041-002000\n12/CA\n$410/CA\n知\n/\n/\n尿液生化品管血清 Ⅰ\nLIQUICHEK URINE CHEMISTRY CONTROL I\n10ML/CA\nBio-Rad/397\n-"

/**
 * Extracts the desired parts from a given string based on the pattern.
 * @param {string} input - The input string to process.
 * @returns {string[]} An array of extracted parts or an empty array if no match is found.
 */

// Feb 6, 2025
// export function extractMaterials(input) {
//   const match = input.match(pattern);
//   console.log(match);
//   if (match) {
//     // Split the match into individual components
//     return match[0].split(/[\s\n]/).filter(Boolean);
//   }
//   return [];
// }

export function extractMaterials(input) {
  const match = input.match(pattern);
  return match || [];
}

// export function extractMaterials(input) {
//   // Split input into lines to handle each line separately
//   const lines = input.split(/\r?\n/);
//   const matches = [];
  
//   // Process each line
//   for (const line of lines) {
//     const lineMatches = line.match(pattern);
//     if (lineMatches) {
//       matches.push(...lineMatches);
//     }
//   }
  
//   // Clean up matches and remove duplicates
//   const cleanMatches = [...new Set(matches.map(match => match.trim()))];
//   console.log("Extracted material IDs:", cleanMatches); // Debug log
//   return cleanMatches;
// }

// // Example usage with test cases
// const testCases = [
//   "BW001\n397\n123\n456 Liquichek Urine Chemistry Control",
//   "BW001 397\n123\n456 Liquichek Urine Chemistry Control",
//   "BW001 397 123 456 Liquichek Urine Chemistry Control",
//   "BW001 397\n Liquichek",
//   "399 BW001 397 123 456 Liquichek Urine Chemistry Control",
//   "SomethingElse 123\n456 BW001 789",
//   "360 Liquichek Immunoassay Plus Control, Trilevel\nSupplier must provide Certificate of Analysis or other\nCertificate certifying date of manufacture with every\nshipment or every lot. Such documents must be\nincluded in the goods upon receipt at Buyer's delivery\naddress or sent to the buyer in advance with\nmatching part purchase order and shipment dates.",
//   "00020\nHK-123\n123_KA\nT_102HSP9601\n1 PK\n980.00\n980.00\n生命科学试剂耗材\nDeliv. date 到货日期 12/11/2024 DD/MM/YYYY\nYour material number HSP9601",
//   "00020\nT_102HSP9601\n1 PK\n980.00\n980.00\n生命科学试剂耗材\nDeliv. date 到货日期 12/11/2024 DD/MM/YYYY\nYour material number HSP9601"
// ];

// // Log the results for each test case
// testCases.forEach((testCase, index) => {
//   console.log(`Test Case ${index + 1}:`);
//   console.log(extractMaterials(testCase));
//   console.log('---');
// });
