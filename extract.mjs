import xlsx from 'xlsx';
import fs from 'fs';

// Load the Excel file
const workbook = xlsx.readFile('China Customers.xlsx');
const sheetName = 'kna1';
const worksheet = workbook.Sheets[sheetName];

// Convert sheet to JSON, skipping the first row
const data = xlsx.utils.sheet_to_json(worksheet, { range: 1, header: 1 });

// Extract columns A-N and create a one-line address
const addresses = data.map(row => {
    const oneLineAddress = [
        row[2],  // Name 1
        row[3],  // Name 2
        row[8],  // Street
        row[4],  // City
        row[5],  // Postal Code
        row[1]   // Country
    ].filter(Boolean).join(', '); // Remove empty values and join

    console.log(oneLineAddress);

    return {
        colA: row[0],
        colB: row[1],
        colC: row[2],
        colD: row[3],
        colE: row[4],
        colF: row[5],
        colG: row[6],
        colH: row[7],
        colI: row[8],
        colJ: row[9],
        colK: row[10],
        colL: row[11],
        colM: row[12],
        colN: row[13],
        address: oneLineAddress
    };
});

// Save the JSON to a file
fs.writeFileSync('addresses.json', JSON.stringify(addresses, null, 2));

console.log('Addresses extracted with one-line addresses successfully!');
