import fs from 'fs';
import readline from 'readline';
import { createReadStream } from 'fs';

async function extractUniqueCustomerNumbers(jsonFilePath) {
    console.log('Extracting unique customer numbers from JSON...');
    const customerNumbers = new Set();
    
    const fileStream = createReadStream(jsonFilePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        // Look for lines containing "id" field
        if (line.includes('"id":')) {
            // Extract the id value using regex
            const match = line.match(/"id":\s*"([^"]+)"/);
            if (match) {
                const id = match[1];
                // Extract the customer number (part before the first dash)
                const customerNumber = id.split('-')[0];
                if (customerNumber && customerNumber.match(/^\d+$/)) {
                    customerNumbers.add(customerNumber);
                }
            }
        }
    }

    console.log(`Found ${customerNumbers.size} unique customer numbers`);
    return customerNumbers;
}

async function extractCustomerNumbers(csvFilePath) {
    console.log('Extracting customer numbers from CSV...');
    const customerNumbers = new Set();
    
    const fileStream = createReadStream(csvFilePath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    let isFirstLine = true;
    for await (const line of rl) {
        if (isFirstLine) {
            // Skip header row
            isFirstLine = false;
            continue;
        }
        
        // Extract the first column (Customer) - handle CSV parsing carefully
        const match = line.match(/^"([^"]+)"/);
        if (match) {
            const customerNumber = match[1];
            if (customerNumber && customerNumber.match(/^\d+$/)) {
                customerNumbers.add(customerNumber);
            }
        }
    }

    console.log(`Found ${customerNumbers.size} customer numbers in CSV`);
    return customerNumbers;
}

function findMissingNumbers(csvCustomers, jsonCustomers) {
    console.log('Finding missing customer numbers...');
    const missing = [];
    
    for (const customerNumber of csvCustomers) {
        if (!jsonCustomers.has(customerNumber)) {
            missing.push(customerNumber);
        }
    }
    
    console.log(`Found ${missing.length} missing customer numbers`);
    return missing.sort((a, b) => parseInt(a) - parseInt(b));
}

async function main() {
    try {
        console.log('Starting comparison process...');
        
        // Exclusion array - customer numbers starting with these digits will be ignored
        const exclusionStartDigits = ['3', '4', '5', '6', '7', '8', '9'];
        
        // File paths
        const jsonFilePath = 'toVectors-full-export.json';
        const csvFilePath = 'prod_data/US/kna1_temp.csv';
        const outputFilePath = 'toVectors-missing.json';
        
        // Check if files exist
        if (!fs.existsSync(jsonFilePath)) {
            throw new Error(`JSON file not found: ${jsonFilePath}`);
        }
        if (!fs.existsSync(csvFilePath)) {
            throw new Error(`CSV file not found: ${csvFilePath}`);
        }
        
        // Extract data from both files
        const jsonCustomerNumbers = await extractUniqueCustomerNumbers(jsonFilePath);
        const csvCustomerNumbers = await extractCustomerNumbers(csvFilePath);
        
        // Filter out excluded customer numbers
        const filteredCustomerNumbers = new Set();
        for (const customerNumber of csvCustomerNumbers) {
            const shouldExclude = exclusionStartDigits.some(digit => customerNumber.startsWith(digit));
            if (!shouldExclude) {
                filteredCustomerNumbers.add(customerNumber);
            }
        }
        
        console.log(`Filtered out ${csvCustomerNumbers.size - filteredCustomerNumbers.size} customers starting with excluded digits`);
        console.log(`Remaining customers to check: ${filteredCustomerNumbers.size}`);
        
        // Find missing numbers
        const missingNumbers = findMissingNumbers(filteredCustomerNumbers, jsonCustomerNumbers);
        
        // Create output object
        const output = {
            summary: {
                timestamp: new Date().toISOString(),
                totalCustomersInCSV: csvCustomerNumbers.size,
                excludedCustomers: csvCustomerNumbers.size - filteredCustomerNumbers.size,
                filteredCustomersToCheck: filteredCustomerNumbers.size,
                totalCustomersInJSON: jsonCustomerNumbers.size,
                missingCount: missingNumbers.length,
                exclusionStartDigits: exclusionStartDigits
            },
            missingCustomerNumbers: missingNumbers
        };
        
        // Write results to file
        fs.writeFileSync(outputFilePath, JSON.stringify(output, null, 2));
        
        console.log('\n=== SUMMARY ===');
        console.log(`Total customers in CSV: ${csvCustomerNumbers.size}`);
        console.log(`Excluded customers (starting with ${exclusionStartDigits.join(', ')}): ${csvCustomerNumbers.size - filteredCustomerNumbers.size}`);
        console.log(`Filtered customers to check: ${filteredCustomerNumbers.size}`);
        console.log(`Total customers in JSON: ${jsonCustomerNumbers.size}`);
        console.log(`Missing customer numbers: ${missingNumbers.length}`);
        console.log(`Results saved to: ${outputFilePath}`);
        
        if (missingNumbers.length > 0) {
            console.log('\nFirst 10 missing numbers:');
            console.log(missingNumbers.slice(0, 10).join(', '));
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

// Run the script
main();
