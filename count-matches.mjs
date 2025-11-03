import fs from 'fs';
import { parse } from 'csv-parse';

// Load missing customer numbers
let missingCustomers = [];
try {
    const missingData = JSON.parse(fs.readFileSync('toVectors-missing.json', 'utf8'));
    missingCustomers = missingData.missingCustomerNumbers || [];
    console.log(`Loaded ${missingCustomers.length.toLocaleString()} missing customer numbers from toVectors-missing.json`);
} catch (error) {
    console.error('Error loading toVectors-missing.json:', error.message);
    process.exit(1);
}

// Convert to Set for faster lookups
const missingCustomersSet = new Set(missingCustomers);

// Function to count matches in CSV
async function countMatches(csvPath, customerColumnName) {
    console.log(`\nProcessing ${csvPath}...`);
    
    let totalRecords = 0;
    let matchedRecords = 0;
    const matchedCustomers = new Set();
    
    const parser = fs
        .createReadStream(csvPath)
        .pipe(parse({
            columns: true,
            skip_empty_lines: true
        }));

    for await (const row of parser) {
        totalRecords++;
        
        // Progress logging every 10,000 records
        if (totalRecords % 10000 === 0) {
            console.log(`  Processed: ${totalRecords.toLocaleString()} records, Matches: ${matchedRecords.toLocaleString()}`);
        }
        
        const customerNumber = row[customerColumnName];
        if (customerNumber && missingCustomersSet.has(customerNumber)) {
            matchedRecords++;
            matchedCustomers.add(customerNumber);
        }
    }
    
    console.log(`\n📊 Results for ${csvPath}:`);
    console.log(`  Total records in CSV: ${totalRecords.toLocaleString()}`);
    console.log(`  Records matching missing customers: ${matchedRecords.toLocaleString()}`);
    console.log(`  Unique customers matched: ${matchedCustomers.size.toLocaleString()}`);
    console.log(`  Match rate: ${((matchedRecords / totalRecords) * 100).toFixed(2)}%`);
    
    return {
        totalRecords,
        matchedRecords,
        uniqueCustomersMatched: matchedCustomers.size,
        matchedCustomers: Array.from(matchedCustomers)
    };
}

// Function to analyze duplicates
async function analyzeDuplicates(csvPath, customerColumnName) {
    console.log(`\nAnalyzing duplicates in ${csvPath}...`);
    
    const customerCounts = new Map();
    let totalRecords = 0;
    
    const parser = fs
        .createReadStream(csvPath)
        .pipe(parse({
            columns: true,
            skip_empty_lines: true
        }));

    for await (const row of parser) {
        totalRecords++;
        
        if (totalRecords % 10000 === 0) {
            console.log(`  Processed: ${totalRecords.toLocaleString()} records`);
        }
        
        const customerNumber = row[customerColumnName];
        if (customerNumber) {
            customerCounts.set(customerNumber, (customerCounts.get(customerNumber) || 0) + 1);
        }
    }
    
    // Find duplicates
    const duplicates = new Map();
    for (const [customer, count] of customerCounts) {
        if (count > 1) {
            duplicates.set(customer, count);
        }
    }
    
    console.log(`\n📊 Duplicate Analysis for ${csvPath}:`);
    console.log(`  Total records: ${totalRecords.toLocaleString()}`);
    console.log(`  Unique customers: ${customerCounts.size.toLocaleString()}`);
    console.log(`  Customers with duplicates: ${duplicates.size.toLocaleString()}`);
    
    if (duplicates.size > 0) {
        console.log(`  Top 10 most duplicated customers:`);
        const sortedDuplicates = Array.from(duplicates.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        for (const [customer, count] of sortedDuplicates) {
            console.log(`    Customer ${customer}: ${count} records`);
        }
    }
    
    return { customerCounts, duplicates };
}

// Main execution
(async () => {
    console.log('🔍 Counting matches between missing customers and CSV files...\n');
    
    try {
        // First analyze duplicates
        const duplicateAnalysis = await analyzeDuplicates('./prod_data/US/kna1_temp.csv', 'Customer');
        
        // Count matches in KNA1 file
        const kna1Results = await countMatches('./prod_data/US/kna1_temp.csv', 'Customer');
        
        console.log('\n🎯 Summary:');
        console.log(`Missing customers loaded: ${missingCustomers.length.toLocaleString()}`);
        console.log(`Total CSV records: ${kna1Results.totalRecords.toLocaleString()}`);
        console.log(`Total matching records (including duplicates): ${kna1Results.matchedRecords.toLocaleString()}`);
        console.log(`Unique customers matched: ${kna1Results.uniqueCustomersMatched.toLocaleString()}`);
        console.log(`Missing customers NOT found in KNA1: ${(missingCustomers.length - kna1Results.uniqueCustomersMatched).toLocaleString()}`);
        
        // Calculate percentage of missing customers found
        const foundPercentage = ((kna1Results.uniqueCustomersMatched / missingCustomers.length) * 100).toFixed(2);
        console.log(`Percentage of missing customers found in KNA1: ${foundPercentage}%`);
        
        // Show duplicate impact
        const duplicateImpact = kna1Results.matchedRecords - kna1Results.uniqueCustomersMatched;
        console.log(`Extra records due to duplicates: ${duplicateImpact.toLocaleString()}`);
        
    } catch (error) {
        console.error('Error during processing:', error.message);
    }
})();
