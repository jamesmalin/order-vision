import fs from 'fs';
import { parse } from 'csv-parse';

// Load missing customer numbers
let missingCustomers = [];
try {
    const missingData = JSON.parse(fs.readFileSync('toVectors-missing.json', 'utf8'));
    missingCustomers = missingData.missingCustomerNumbers || [];
    console.log(`Loaded ${missingCustomers.length.toLocaleString()} missing customer numbers`);
} catch (error) {
    console.error('Error loading toVectors-missing.json:', error.message);
    process.exit(1);
}

const missingCustomersSet = new Set(missingCustomers);

// Function to analyze deletion flags for missing customers
async function analyzeDeletionFlags(csvPath) {
    console.log(`\nAnalyzing deletion flags for missing customers in ${csvPath}...`);
    
    let totalRecords = 0;
    let matchingMissingCustomers = 0;
    const deletionFlagSamples = [];
    
    const parser = fs
        .createReadStream(csvPath)
        .pipe(parse({
            columns: true,
            skip_empty_lines: true
        }));

    for await (const row of parser) {
        totalRecords++;
        
        if (totalRecords % 50000 === 0) {
            console.log(`  Processed: ${totalRecords.toLocaleString()} records`);
        }
        
        const customerNumber = row['Customer'];
        const country = row['Country'];
        const deletionFlag = row['Central Deletion Flag'];
        
        // Check if this is a missing customer that passes the first filters
        if (customerNumber && missingCustomersSet.has(customerNumber)) {
            // Apply the same filters as toVectors.mjs up to deletion flag
            if (!customerNumber || parseInt(customerNumber) > 3000000) {
                continue;
            }
            if (!country || country === 'US') {
                continue;
            }
            
            matchingMissingCustomers++;
            
            // Collect samples of deletion flags
            if (deletionFlagSamples.length < 20) {
                deletionFlagSamples.push({
                    customer: customerNumber,
                    country: country,
                    deletionFlag: deletionFlag,
                    deletionFlagType: typeof deletionFlag,
                    deletionFlagLength: deletionFlag ? deletionFlag.length : 0,
                    deletionFlagTrimmed: deletionFlag ? deletionFlag.trim() : '',
                    deletionFlagUpper: deletionFlag ? deletionFlag.trim().toUpperCase() : '',
                    wouldBeFiltered: deletionFlag && deletionFlag.trim().toUpperCase() === 'X'
                });
            }
        }
    }
    
    console.log(`\n📊 Deletion Flag Analysis for Missing Customers:`);
    console.log(`  Missing customers that pass country/range filters: ${matchingMissingCustomers.toLocaleString()}`);
    
    console.log(`\n🔍 Sample Deletion Flag Values:`);
    for (const sample of deletionFlagSamples) {
        console.log(`  Customer ${sample.customer}:`);
        console.log(`    Raw value: "${sample.deletionFlag}"`);
        console.log(`    Type: ${sample.deletionFlagType}`);
        console.log(`    Length: ${sample.deletionFlagLength}`);
        console.log(`    Trimmed: "${sample.deletionFlagTrimmed}"`);
        console.log(`    Upper: "${sample.deletionFlagUpper}"`);
        console.log(`    Would be filtered: ${sample.wouldBeFiltered}`);
        console.log(`    ---`);
    }
}

// Main execution
(async () => {
    try {
        await analyzeDeletionFlags('./prod_data/US/kna1_temp.csv');
    } catch (error) {
        console.error('Error during analysis:', error.message);
    }
})();
