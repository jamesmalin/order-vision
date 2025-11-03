import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

// Read Excel files and extract data from specific sheets
function readExcelSheet(filePath, sheetName) {
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet);
}

// Main function to process the files
async function processFiles() {
    try {
        // Read headers from SAP Document Export sheet
        const headers = readExcelSheet('Headers.xlsx', 'SAP Document Export');
        
        // Read line items from Sheet1
        const lineItems = readExcelSheet('Line Items.xlsx', 'Sheet1');

        // Group by header's Identifier
        const combinedData = {};
        
        // First set up the structure with headers
        headers.forEach(header => {
            const identifier = header.Identifier;
            if (!combinedData[identifier]) {
                combinedData[identifier] = {
                    file: identifier,
                    header: header,
                    line_items: []
                };
            }
        });

        // Then add all matching line items
        lineItems.forEach(item => {
            const ordIntNum = item.ORD_INTNUM;
            if (combinedData[ordIntNum]) {
                combinedData[ordIntNum].line_items.push(item);
            }
        });

        // Create the final structure with sorted files
        const result = {
            files: Object.values(combinedData)
                .filter(item => item.header && item.line_items.length > 0) // Only include items that have both header and line items
                .sort((a, b) => {
                    // Extract numeric portion from OR numbers for proper numeric sorting
                    const aNum = parseInt(a.file.replace(/\D/g, ''));
                    const bNum = parseInt(b.file.replace(/\D/g, ''));
                    return aNum - bNum;
                })
        };

        // Write to combined.json
        fs.writeFileSync('combined.json', JSON.stringify(result, null, 2));
        console.log('Successfully created combined.json');

    } catch (error) {
        console.error('Error processing files:', error);
    }
}

processFiles();
