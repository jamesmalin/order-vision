import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { createWriteStream } from 'fs';

// Function to find all files matching pattern in directory
function findFiles(startPath, pattern) {
    let results = [];
    
    function processDir(currentPath) {
        const files = fs.readdirSync(currentPath);
        
        for (const file of files) {
            const filePath = path.join(currentPath, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory()) {
                processDir(filePath);
            } else if (file.toLowerCase().includes(pattern.toLowerCase()) && 
                      (file.toLowerCase().endsWith('.xlsx') || file.toLowerCase().endsWith('.xls'))) {
                results.push(filePath);
            }
        }
    }
    
    processDir(startPath);
    return results;
}

// Function to convert Excel row to CSV line
function rowToCSV(row) {
    return Object.values(row)
        .map(val => {
            if (val === null || val === undefined) return '';
            return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(',') + '\n';
}

// Function to process files and write to CSV
async function processToCSV(files, csvPath) {
    const writeStream = createWriteStream(csvPath);
    let isFirstFile = true;
    
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`Processing file ${i + 1} of ${files.length}: ${file}`);
        
        try {
            const workbook = xlsx.readFile(file);
            const worksheet = workbook.Sheets['Sheet1'];
            const data = xlsx.utils.sheet_to_json(worksheet);
            
            // Write headers only for the first file
            if (isFirstFile && data.length > 0) {
                const headers = Object.keys(data[0]);
                writeStream.write(headers.map(h => `"${h}"`).join(',') + '\n');
                isFirstFile = false;
            }
            
            // Write data rows
            for (const row of data) {
                writeStream.write(rowToCSV(row));
            }
            
            // Clear workbook data
            workbook.Sheets = {};
            workbook.SheetNames = [];
        } catch (error) {
            console.error(`Error processing file ${file}:`, error.message);
        }
    }
    
    return new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
        writeStream.end();
    });
}

// Function to convert CSV to XLSX
function convertCSVtoXLSX(csvPath, xlsxPath) {
    console.log(`Converting ${csvPath} to ${xlsxPath}`);
    const workbook = xlsx.utils.book_new();
    const content = fs.readFileSync(csvPath, 'utf8');
    // Parse CSV content
    const rows = content.split('\n').map(line => 
        line.split(',').map(cell => 
            cell.trim().replace(/^"(.*)"$/, '$1').replace(/""/g, '"')
        )
    ).filter(row => row.length > 1 || row[0] !== ''); // Remove empty rows
    
    const worksheet = xlsx.utils.aoa_to_sheet(rows);
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    xlsx.writeFile(workbook, xlsxPath);
    fs.unlinkSync(csvPath); // Remove temporary CSV file
}

// Main process
async function main() {
    const baseDir = './prod_data/US';

    // Find all KNA1 and ADRC files
    const kna1Files = findFiles(baseDir, 'kna1');
    const adrcFiles = findFiles(baseDir, 'adrc');
    const knvpFiles = findFiles(baseDir, 'knvp');

    console.log('Found KNA1 files:', kna1Files);
    console.log('Found ADRC files:', adrcFiles);
    console.log('Found KNVP files:', knvpFiles);

    // Process KNA1 files
    console.log('\nProcessing KNA1 files...');
    const kna1CSVPath = './prod_data/US/kna1_temp.csv';
    await processToCSV(kna1Files, kna1CSVPath);
    // convertCSVtoXLSX(kna1CSVPath, './prod_data/US/kna1.xlsx');

    // Process ADRC files
    console.log('\nProcessing ADRC files...');
    const adrcCSVPath = './prod_data/US/adrc_temp.csv';
    await processToCSV(adrcFiles, adrcCSVPath);
    // convertCSVtoXLSX(adrcCSVPath, './prod_data/US/adrc.xlsx');

    // Process ADRC files
    console.log('\nProcessing KNVP files...');
    const knvpCSVPath = './prod_data/US/knvp_temp.csv';
    await processToCSV(knvpFiles, knvpCSVPath);
    // convertCSVtoXLSX(adrcCSVPath, './prod_data/US/knvp.xlsx');

    console.log('\nProcess completed. Files saved to:');
    // console.log('- ./prod_data/US/kna1.xlsx');
    // console.log('- ./prod_data/US/adrc.xlsx');
    // console.log('- ./prod_data/US/knvp.xlsx');
}

main().catch(console.error);
