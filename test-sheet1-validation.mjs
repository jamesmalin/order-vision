import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';

// Function to find all XLSX files in directory
function findXLSXFiles(startPath) {
    let results = [];
    
    function processDir(currentPath) {
        const files = fs.readdirSync(currentPath);
        
        for (const file of files) {
            const filePath = path.join(currentPath, file);
            const stat = fs.statSync(filePath);
            
            if (stat.isDirectory()) {
                processDir(filePath);
            } else if (file.toLowerCase().endsWith('.xlsx')) {
                results.push(filePath);
            }
        }
    }
    
    processDir(startPath);
    return results;
}

// Function to categorize file by type
function getFileType(filePath) {
    const fileName = path.basename(filePath).toLowerCase();
    if (fileName.includes('kna1')) return 'KNA1';
    if (fileName.includes('adrc')) return 'ADRC';
    if (fileName.includes('knvp')) return 'KNVP';
    if (fileName.includes('knvv')) return 'KNVV';
    return 'OTHER';
}

// Function to test a single file
function testFile(filePath) {
    const result = {
        file: filePath,
        type: getFileType(filePath),
        status: 'UNKNOWN',
        hasSheet1: false,
        sheets: [],
        error: null
    };
    
    try {
        const workbook = xlsx.readFile(filePath);
        result.sheets = workbook.SheetNames;
        result.hasSheet1 = workbook.SheetNames.includes('Sheet1');
        result.status = result.hasSheet1 ? 'PASS' : 'FAIL';
        
        // Clean up workbook to free memory
        workbook.Sheets = {};
        workbook.SheetNames = [];
    } catch (error) {
        result.status = 'ERROR';
        result.error = error.message;
    }
    
    return result;
}

// Main test function
async function main() {
    const baseDir = './prod_data/US';
    
    console.log('🔍 Finding all XLSX files in', baseDir);
    const xlsxFiles = findXLSXFiles(baseDir);
    
    console.log(`📊 Found ${xlsxFiles.length} XLSX files to test\n`);
    
    const results = [];
    const summary = {
        total: xlsxFiles.length,
        pass: 0,
        fail: 0,
        error: 0,
        byType: {}
    };
    
    // Test each file
    for (let i = 0; i < xlsxFiles.length; i++) {
        const file = xlsxFiles[i];
        console.log(`Testing ${i + 1}/${xlsxFiles.length}: ${file}`);
        
        const result = testFile(file);
        results.push(result);
        
        // Update summary
        summary[result.status.toLowerCase()]++;
        
        if (!summary.byType[result.type]) {
            summary.byType[result.type] = { total: 0, pass: 0, fail: 0, error: 0 };
        }
        summary.byType[result.type].total++;
        summary.byType[result.type][result.status.toLowerCase()]++;
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 DETAILED RESULTS');
    console.log('='.repeat(80));
    
    // Show failed files first
    const failedFiles = results.filter(r => r.status === 'FAIL');
    if (failedFiles.length > 0) {
        console.log('\n❌ FILES MISSING Sheet1:');
        failedFiles.forEach(result => {
            console.log(`   ${result.file}`);
            console.log(`      Type: ${result.type}`);
            console.log(`      Available sheets: [${result.sheets.join(', ')}]`);
        });
    }
    
    // Show error files
    const errorFiles = results.filter(r => r.status === 'ERROR');
    if (errorFiles.length > 0) {
        console.log('\n⚠️  FILES WITH ERRORS:');
        errorFiles.forEach(result => {
            console.log(`   ${result.file}`);
            console.log(`      Type: ${result.type}`);
            console.log(`      Error: ${result.error}`);
        });
    }
    
    // Show successful files (abbreviated)
    const passedFiles = results.filter(r => r.status === 'PASS');
    if (passedFiles.length > 0) {
        console.log(`\n✅ FILES WITH Sheet1: ${passedFiles.length} files`);
        // Show just the first few as examples
        passedFiles.slice(0, 3).forEach(result => {
            console.log(`   ${result.file} (${result.type})`);
        });
        if (passedFiles.length > 3) {
            console.log(`   ... and ${passedFiles.length - 3} more`);
        }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY STATISTICS');
    console.log('='.repeat(80));
    
    console.log(`\nOverall Results:`);
    console.log(`  Total files tested: ${summary.total}`);
    console.log(`  ✅ Passed (has Sheet1): ${summary.pass}`);
    console.log(`  ❌ Failed (missing Sheet1): ${summary.fail}`);
    console.log(`  ⚠️  Errors (couldn't open): ${summary.error}`);
    console.log(`  Success rate: ${((summary.pass / summary.total) * 100).toFixed(1)}%`);
    
    console.log(`\nResults by File Type:`);
    Object.entries(summary.byType).forEach(([type, stats]) => {
        const successRate = ((stats.pass / stats.total) * 100).toFixed(1);
        console.log(`  ${type}:`);
        console.log(`    Total: ${stats.total}, Pass: ${stats.pass}, Fail: ${stats.fail}, Error: ${stats.error}`);
        console.log(`    Success rate: ${successRate}%`);
    });
    
    // Final recommendation
    console.log('\n' + '='.repeat(80));
    console.log('💡 RECOMMENDATIONS');
    console.log('='.repeat(80));
    
    if (summary.fail === 0 && summary.error === 0) {
        console.log('✅ All files have Sheet1! The toVectorsCombineXLSX.mjs script should work correctly.');
    } else {
        console.log('⚠️  Some files are missing Sheet1 or have errors.');
        console.log('   Consider updating the main script to handle different sheet names or fix the problematic files.');
        
        if (summary.fail > 0) {
            console.log(`   ${summary.fail} files are missing Sheet1 worksheet.`);
        }
        if (summary.error > 0) {
            console.log(`   ${summary.error} files couldn't be opened (may be corrupted).`);
        }
    }
    
    console.log('\n🏁 Test completed!');
}

main().catch(console.error);
