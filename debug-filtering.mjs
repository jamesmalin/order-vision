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

// Function to analyze filtering impact
async function analyzeFiltering(csvPath) {
    console.log(`\nAnalyzing filtering impact on ${csvPath}...`);
    
    let totalRecords = 0;
    let matchingMissingCustomers = 0;
    let afterCustomerFilter = 0;
    let afterCountryFilter = 0;
    let afterDeletionFilter = 0;
    let finalRecords = 0;
    
    const countryStats = new Map();
    const deletionFlagStats = new Map();
    const customerRangeStats = {
        under1M: 0,
        between1M_3M: 0,
        over3M: 0
    };
    
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
        
        const customerNumber = row['Customer'];
        const country = row['Country'];
        const deletionFlag = row['Central Deletion Flag'];
        
        // Track country distribution
        if (country) {
            countryStats.set(country, (countryStats.get(country) || 0) + 1);
        }
        
        // Track deletion flag distribution
        const deletionStatus = deletionFlag && deletionFlag.trim().toUpperCase() === 'X' ? 'DELETED' : 'ACTIVE';
        deletionFlagStats.set(deletionStatus, (deletionFlagStats.get(deletionStatus) || 0) + 1);
        
        // Track customer number ranges
        if (customerNumber) {
            const custNum = parseInt(customerNumber);
            if (custNum < 1000000) {
                customerRangeStats.under1M++;
            } else if (custNum <= 3000000) {
                customerRangeStats.between1M_3M++;
            } else {
                customerRangeStats.over3M++;
            }
        }
        
        // Check if this is a missing customer
        if (customerNumber && missingCustomersSet.has(customerNumber)) {
            matchingMissingCustomers++;
            
            // Apply the same filters as toVectors.mjs
            
            // Filter 1: Customer number and range check
            if (!customerNumber || parseInt(customerNumber) > 3000000) {
                continue;
            }
            afterCustomerFilter++;
            
            // Filter 2: Country check (this is the problematic one!)
            if (!country || country === 'US') {
                continue;
            }
            afterCountryFilter++;
            
            // Filter 3: Deletion flag check
            if (deletionFlag && deletionFlag.trim().toUpperCase() === 'X') {
                continue;
            }
            afterDeletionFilter++;
            
            finalRecords++;
        }
    }
    
    console.log(`\n📊 Filtering Analysis Results:`);
    console.log(`  Total records in CSV: ${totalRecords.toLocaleString()}`);
    console.log(`  Missing customers found: ${matchingMissingCustomers.toLocaleString()}`);
    console.log(`  After customer/range filter: ${afterCustomerFilter.toLocaleString()}`);
    console.log(`  After country filter: ${afterCountryFilter.toLocaleString()}`);
    console.log(`  After deletion filter: ${afterDeletionFilter.toLocaleString()}`);
    console.log(`  Final records that would be processed: ${finalRecords.toLocaleString()}`);
    
    console.log(`\n🌍 Country Distribution (top 10):`);
    const sortedCountries = Array.from(countryStats.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    for (const [country, count] of sortedCountries) {
        console.log(`    ${country}: ${count.toLocaleString()}`);
    }
    
    console.log(`\n🗑️ Deletion Flag Distribution:`);
    for (const [status, count] of deletionFlagStats) {
        console.log(`    ${status}: ${count.toLocaleString()}`);
    }
    
    console.log(`\n📈 Customer Number Range Distribution:`);
    console.log(`    Under 1M: ${customerRangeStats.under1M.toLocaleString()}`);
    console.log(`    1M - 3M: ${customerRangeStats.between1M_3M.toLocaleString()}`);
    console.log(`    Over 3M: ${customerRangeStats.over3M.toLocaleString()}`);
}

// Main execution
(async () => {
    try {
        await analyzeFiltering('./prod_data/US/kna1_temp.csv');
    } catch (error) {
        console.error('Error during analysis:', error.message);
    }
})();
