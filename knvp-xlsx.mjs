import xlsx from 'xlsx';
import fs from 'fs';

const workbooks = [
  './prod_data/CN PROD 20250121.xlsx',
  './prod_data/HK PROD 20250121.xlsx',
  './prod_data/TW PROD 20250121.xlsx'
];

const mappings = {};

workbooks.forEach(filePath => {
  // Load the Excel file
  const workbook = xlsx.readFile(filePath);
  const sheetNameKnvp = 'knvp';
  const worksheetKnvp = workbook.Sheets[sheetNameKnvp];

  // Convert worksheet to JSON array with headers
  const data = xlsx.utils.sheet_to_json(worksheetKnvp, { header: 1 });

  // Extract column indices for clarity
  const headers = data[0];
  const soldToIndex = headers.indexOf('Customer'); // Column A
  const shipToIndex = headers.lastIndexOf('Customer'); // Column G
  const partnerFunctionIndex = headers.indexOf('Partner Function');

  // Process rows
  data.slice(1).forEach(row => {
    const soldTo = row[soldToIndex];
    const shipTo = row[shipToIndex];
    const partnerFunction = row[partnerFunctionIndex];

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
fs.writeFileSync('./knvp.json', JSON.stringify(mappings, null, 2), 'utf-8');

console.log('knvp.json has been saved!');