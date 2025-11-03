// import libre from 'libreoffice-convert';
// import { readFileSync, writeFileSync } from 'fs';
// import { join } from 'path';

// // Path to your XLSX file and desired output file
// const inputFilePath = join(process.cwd(), 'BR訂購單_辰星20240809.xlsx');
// const outputFilePath = join(process.cwd(), 'output.pdf');

// // Read the file
// const file = readFileSync(inputFilePath);

// // Convert it to pdf format with undefined filter (see LibreOffice docs about filter)
// libre.convert(file, '.pdf', undefined, (err, done) => {
//   if (err) {
//     console.error(`Error converting file: ${err.message}`);
//     return;
//   }

//   // Here in done you have the PDF file which you can save or transfer in another stream
//   writeFileSync(outputFilePath, done);
//   console.log(`File converted successfully to ${outputFilePath}`);
// });

import ExcelJS from 'exceljs';
import libre from 'libreoffice-convert';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

async function removeOtherSheetsAndConvert() {
  const inputFilePath = join(process.cwd(), 'BR訂購單_辰星20240809.xlsx');
  const tempXlsxFilePath = join(process.cwd(), 'temp_first_sheet.xlsx');
  const outputFilePath = join(process.cwd(), 'output.pdf');

  // Step 1: Load the workbook using ExcelJS
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(inputFilePath);

  // Step 2: Retain only the first sheet
  const firstSheetName = workbook.worksheets[0].name;
  workbook.worksheets.forEach((sheet, index) => {
    if (index !== 0) {
      workbook.removeWorksheet(sheet.id);
    }
  });

  // Step 3: Save the workbook with only the first sheet
  await workbook.xlsx.writeFile(tempXlsxFilePath);

  // Step 4: Convert the temporary XLSX file to PDF using LibreOffice
  const file = readFileSync(tempXlsxFilePath);
  libre.convert(file, '.pdf', undefined, (err, done) => {
    if (err) {
      console.error(`Error converting file: ${err.message}`);
      return;
    }

    writeFileSync(outputFilePath, done);
    console.log(`File converted successfully to ${outputFilePath}`);

    // Clean up the temporary XLSX file
    unlinkSync(tempXlsxFilePath);
  });
}

removeOtherSheetsAndConvert().catch(console.error);

