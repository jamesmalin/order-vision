import xlsx from 'xlsx';

const workbookKna1 = xlsx.readFile('prod_data/US/01/kna1-01.XLSX');
const workbookUniversal = xlsx.readFile('prod_data/US/01/adrc-01.XLSX');

const sheetNameKna1 = 'kna1';
const worksheetKna1 = workbookKna1.Sheets[sheetNameKna1];
const sheetNameUniversalAddress = 'adrc';
const worksheetUniversal = workbookUniversal.Sheets[sheetNameUniversalAddress];

const dataKna1 = xlsx.utils.sheet_to_json(worksheetKna1);

// Extract kna1 data
const defaultRecords = [];
const kna1Records = dataKna1.filter(row => {
    if (row['Customer'] && Number(row['Customer']) <= 3000000) {
        if (row['Central Deletion Flag'] && row['Central Deletion Flag'].trim().toUpperCase() === 'X') {
            console.log(`Skipping record with Central Deletion Flag: ${row['Customer']}`);
            defaultRecords.push(row['Customer']);
            return false;
        }
        return true;
    }
    return false;
});

console.log(JSON.stringify(defaultRecords, null, 2));
