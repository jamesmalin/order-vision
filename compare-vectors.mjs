import { Pinecone } from "@pinecone-database/pinecone";
import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const pinecone_api_key = process.env.PINECONE_PROD_API_KEY;
const vectorIndexName = 'addresses';
const namespace = 'address_v8_prod_adrc';

// Function to initialize Pinecone
async function initializePinecone() {
    const pinecone = new Pinecone({ apiKey: pinecone_api_key });
    const index = pinecone.index(vectorIndexName);
    console.log("Pinecone client and index initialized");
    return index;
}

// Function to get all vector IDs from the namespace
async function getAllVectorIds() {
    try {
        const index = await initializePinecone();
        const ns = index.namespace(namespace);

        console.log('Fetching all vector IDs from namespace...');

        // Create a dummy vector for querying (required by Pinecone)
        const dummyVector = new Array(1536).fill(0);

        // Get all vectors by querying with a very broad filter
        const response = await ns.query({
            topK: 10000, // Maximum allowed by Pinecone
            vector: dummyVector,
            includeMetadata: true,
            includeValues: false
        });

        if (!response.matches || response.matches.length === 0) {
            console.log('No vectors found in namespace');
            return [];
        }

        // Extract customer numbers from metadata
        const customerNumbers = new Set();
        response.matches.forEach(match => {
            if (match.metadata && match.metadata.customer) {
                customerNumbers.add(match.metadata.customer.toString());
            }
        });

        console.log(`Found ${customerNumbers.size} unique customer numbers in vectors`);
        return Array.from(customerNumbers);
    } catch (error) {
        console.error('Error fetching vector IDs:', error);
        throw error;
    }
}

// Function to read customer numbers from Excel file
function readCustomerNumbersFromExcel(filePath) {
    try {
        console.log(`Reading Excel file: ${filePath}`);
        
        if (!fs.existsSync(filePath)) {
            console.warn(`File not found: ${filePath}`);
            return [];
        }

        const workbook = xlsx.readFile(filePath);
        const customerNumbers = new Set();

        // Check multiple possible sheet names and column names
        const possibleSheetNames = ['kna1', 'Sheet1', 'customers', 'data'];
        const possibleColumnNames = ['Customer', 'customer', 'Customer Number', 'customer_number', 'CUSTOMER'];

        for (const sheetName of workbook.SheetNames) {
            if (possibleSheetNames.some(name => sheetName.toLowerCase().includes(name.toLowerCase())) || 
                workbook.SheetNames.length === 1) {
                
                console.log(`Processing sheet: ${sheetName}`);
                const worksheet = workbook.Sheets[sheetName];
                const data = xlsx.utils.sheet_to_json(worksheet);

                if (data.length === 0) {
                    console.log(`No data found in sheet: ${sheetName}`);
                    continue;
                }

                // Find the customer column
                let customerColumn = null;
                const firstRow = data[0];
                
                for (const possibleName of possibleColumnNames) {
                    if (firstRow.hasOwnProperty(possibleName)) {
                        customerColumn = possibleName;
                        break;
                    }
                }

                if (!customerColumn) {
                    console.log(`No customer column found in sheet: ${sheetName}`);
                    console.log(`Available columns: ${Object.keys(firstRow).join(', ')}`);
                    continue;
                }

                console.log(`Using customer column: ${customerColumn}`);

                // Extract customer numbers
                data.forEach(row => {
                    const customerValue = row[customerColumn];
                    if (customerValue) {
                        // Convert to string and clean up
                        const customerStr = customerValue.toString().trim();
                        if (customerStr && customerStr !== '' && !isNaN(customerStr)) {
                            customerNumbers.add(customerStr);
                        }
                    }
                });

                console.log(`Found ${customerNumbers.size} customer numbers in ${sheetName}`);
                break; // Use the first valid sheet found
            }
        }

        return Array.from(customerNumbers);
    } catch (error) {
        console.error(`Error reading Excel file ${filePath}:`, error);
        return [];
    }
}

// Function to find Excel files recursively in a directory
function findExcelFiles(dirPath) {
    const excelFiles = [];
    
    if (!fs.existsSync(dirPath)) {
        console.warn(`Directory not found: ${dirPath}`);
        return excelFiles;
    }

    function searchDirectory(currentPath) {
        const items = fs.readdirSync(currentPath);
        
        for (const item of items) {
            const fullPath = path.join(currentPath, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                searchDirectory(fullPath);
            } else if (stat.isFile()) {
                const ext = path.extname(item).toLowerCase();
                if (ext === '.xlsx' || ext === '.xls') {
                    // Skip temporary Excel files
                    if (!item.startsWith('~$')) {
                        excelFiles.push(fullPath);
                    }
                }
            }
        }
    }
    
    searchDirectory(dirPath);
    return excelFiles;
}

// Main comparison function
async function compareVectorsWithExcelFiles(excelPaths) {
    try {
        console.log('Starting vector comparison...');
        
        // Get all customer numbers from vectors
        const vectorCustomers = await getAllVectorIds();
        console.log(`Total customers in vectors: ${vectorCustomers.length}`);

        // Collect all customer numbers from Excel files
        const excelCustomers = new Set();
        const fileResults = {};

        for (const excelPath of excelPaths) {
            console.log(`\nProcessing: ${excelPath}`);
            
            let filesToProcess = [];
            
            // Check if it's a directory or file
            if (fs.existsSync(excelPath)) {
                const stat = fs.statSync(excelPath);
                if (stat.isDirectory()) {
                    filesToProcess = findExcelFiles(excelPath);
                    console.log(`Found ${filesToProcess.length} Excel files in directory`);
                } else if (stat.isFile()) {
                    filesToProcess = [excelPath];
                }
            } else {
                console.warn(`Path not found: ${excelPath}`);
                continue;
            }

            // Process each Excel file
            for (const filePath of filesToProcess) {
                const customers = readCustomerNumbersFromExcel(filePath);
                fileResults[filePath] = customers.length;
                
                // Add to the combined set
                customers.forEach(customer => excelCustomers.add(customer));
            }
        }

        console.log(`\nTotal unique customers in Excel files: ${excelCustomers.size}`);

        // Find customers that are in vectors but NOT in Excel files
        const notInExcel = vectorCustomers.filter(customer => !excelCustomers.has(customer));
        
        console.log(`\nCustomers in vectors but NOT in Excel files: ${notInExcel.length}`);

        // Create detailed results
        const results = {
            summary: {
                totalVectorCustomers: vectorCustomers.length,
                totalExcelCustomers: excelCustomers.size,
                customersNotInExcel: notInExcel.length,
                comparisonDate: new Date().toISOString()
            },
            fileResults: fileResults,
            customersNotInExcel: notInExcel.sort((a, b) => parseInt(a) - parseInt(b))
        };

        // Save results to JSON file
        const outputFile = 'compare-vectors-not-matching.json';
        fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
        
        console.log(`\nResults saved to: ${outputFile}`);
        console.log(`\nSummary:`);
        console.log(`- Vector customers: ${results.summary.totalVectorCustomers}`);
        console.log(`- Excel customers: ${results.summary.totalExcelCustomers}`);
        console.log(`- Not in Excel: ${results.summary.customersNotInExcel}`);

        return results;

    } catch (error) {
        console.error('Error in comparison:', error);
        throw error;
    }
}

// Example usage - you can modify these paths as needed
const excelPaths = [
    'prod_data/Customers-BR-IN-SG PROD 20250722/adrc PROD_20250722_1135am.XLSX',
    'prod_data_old/CN PROD 20250121.xlsx',
    'prod_data_old/HK PROD 20250121.xlsx',
    'prod_data_old/TW PROD 20250121.xlsx',
    // Add more paths as needed
    // 'prod_data_old/US', // This would process all Excel files in the US directory
];

// Run the comparison
(async () => {
    try {
        await compareVectorsWithExcelFiles(excelPaths);
    } catch (error) {
        console.error('Comparison failed:', error);
        process.exit(1);
    }
})();

// Export functions for use in other modules
export { compareVectorsWithExcelFiles, getAllVectorIds, readCustomerNumbersFromExcel };
