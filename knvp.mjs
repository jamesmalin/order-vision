import fs from 'fs';
import { parse } from 'csv-parse/sync';

const files = [
  './prod_data/US/knvp_temp.csv'
];

const mappings = {};

files.forEach(filePath => {
  // Read and parse the CSV file
  const content = fs.readFileSync(filePath, 'utf-8');
  const data = parse(content, {
    columns: true, // Use headers as column names
    skip_empty_lines: true,
    trim: true
  });

  data.forEach(row => {
    const soldTo = row['Customer']; // First Customer column
    const shipTo = row['Customer_1']; // Second Customer column
    const partnerFunction = row['Partner Function'];

    // Skip rows without valid data
    if (!soldTo || !shipTo) return;

    // Initialize arrays if not already present
    if (!mappings[soldTo]) {
      mappings[soldTo] = [];
    }
    if (!mappings[shipTo]) {
      mappings[shipTo] = [];
    }

    // Add mapping for sold_to -> ship_to only if partnerFunction is "SH"
    if (partnerFunction === "SH") {
      mappings[soldTo].push({ customer: shipTo });
    }

    // Add mapping for ship_to -> sold_to regardless of partnerFunction
    mappings[shipTo].push({ customer: soldTo });
  });
});

// Deduplicate and format the mappings
Object.keys(mappings).forEach(key => {
  mappings[key] = [...new Map(mappings[key].map(item => [item.customer, item])).values()];
});

// Save to knvp.json
fs.writeFileSync('./knvp-us.json', JSON.stringify(mappings, null, 2), 'utf-8');

console.log('knvp.json has been saved!');


// import fs from 'fs';

// // Read the existing knvp.json file
// const knvpPath = './knvp.json';
// const existingMappings = JSON.parse(fs.readFileSync(knvpPath, 'utf-8'));

// // Deduplicate and format the mappings
// Object.keys(existingMappings).forEach(key => {
//   existingMappings[key] = [...new Map(existingMappings[key].map(item => [item.customer, item])).values()];
// });

// // Save the deduplicated mappings back to knvp.json
// fs.writeFileSync(knvpPath, JSON.stringify(existingMappings, null, 2), 'utf-8');

// console.log('knvp.json has been deduplicated and saved!');
