import { parse, format } from 'date-fns';
import { enUS, zhCN } from 'date-fns/locale';

export async function formatDates(US, dateStr) {
  if (!dateStr) { 
    return false;
  }
  // order matters, so shorter formats should always come first
//   const dateFormats = [
//     // U.S. date formats (shorter formats first)
//     'M/d/yy', 'M/d/yyyy', 
//     'MM/dd/yy', 'MM/dd/yyyy',
//     'M-d-yy', 'M-d-yyyy', 
//     'MM-dd-yy', 'MM-dd-yyyy',
    
//     // European date formats (shorter formats first)
//     'd/M/yy', 'd/M/yyyy', 
//     'dd/MM/yy', 'dd/MM/yyyy',
    
//     // ISO formats (shorter formats first)
//     'yy/MM/dd', 'yyyy/MM/dd', 
//     'yy/dd/MM', 'yyyy/dd/MM',
    
//     // Formats with named months (ensure that 'yy' comes before 'yyyy')
//     'd-MMM-yy', 'd-MMM-yyyy', 
//     'dd-MMM-yy', 'dd-MMM-yyyy',
//     'd MMM yy', 'd MMM yyyy', 
//     'dd MMM yy', 'dd MMM yyyy',
//     'MMM d, yy', 'MMM d, yyyy', 
//     'MMMM dd, yy', 'MMMM dd, yyyy',
    
//     // Other common formats
//     'dd.MM.yy', 'dd.MM.yyyy', 
//     'd.MM.yy', 'd.MM.yyyy',
//     'dd-MM-yy', 'dd-MM-yyyy', 
//     'd MMMM yyyy', // e.g., 31 DECEMBER 2023
//     'dd MMMM yyyy', // e.g., 15 January 2024
//     'MMM dd, yyyy', // e.g., Jan 19, without year
//     'MMMM d, yyyy', // e.g., January 17, 2024
//   ]; 

	const dateFormats = [
		// Month-Day-Year Formats
		'M/d/yy', 'M/dd/yy', 'MM/d/yy', 'MM/dd/yy',
		'M/d/yyyy', 'M/dd/yyyy', 'MM/d/yyyy', 'MM/dd/yyyy',
		'M-d-yy', 'M-dd-yy', 'MM-d-yy', 'MM-dd-yy',
		'M-d-yyyy', 'M-dd-yyyy', 'MM-d-yyyy', 'MM-dd-yyyy',
		'M d yy', 'M dd yy', 'MM d yy', 'MM dd yy',
		'M d yyyy', 'M dd yyyy', 'MM d yyyy', 'MM dd yyyy',
		'Mdyy', 'Mddyy', 'MMdyy', 'MMddyy',
		'Mdyyyy', 'Mddyyyy', 'MMdyyyy', 'MMddyyyy',
		'M.d.yy', 'M.dd.yy', 'MM.d.yy', 'MM.dd.yy',
		'M.d.yyyy', 'M.dd.yyyy', 'MM.d.yyyy', 'MM.dd.yyyy',

		// Year-Month-Day Formats
		'yy/M/d', 'yy/M/dd', 'yy/MM/d', 'yy/MM/dd',
		'yyyy/M/d', 'yyyy/M/dd', 'yyyy/MM/d', 'yyyy/MM/dd',
		'yy-M-d', 'yy-M-dd', 'yy-MM-d', 'yy-MM-dd',
		'yyyy-M-d', 'yyyy-M-dd', 'yyyy-MM-d', 'yyyy-MM-dd',
		'yy M d', 'yy M dd', 'yy MM d', 'yy MM dd',
		'yyyy M d', 'yyyy M dd', 'yyyy MM d', 'yyyy MM dd',
		'yyMd', 'yyMdd', 'yyMMd', 'yyMMdd',
		'yyyyMd', 'yyyyMdd', 'yyyyMMd', 'yyyyMMdd',
		'yy.M.d', 'yy.M.dd', 'yy.MM.d', 'yy.MM.dd',
		'yyyy.M.d', 'yyyy.M.dd', 'yyyy.MM.d', 'yyyy.MM.dd',
	];

    const monthAbbreviations = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

    // Normalize the date string
    let cleanDateStr = dateStr.replace(/['".\s]+/g, ' ').trim().toLowerCase();

    // Check if the date contains a month abbreviation
    monthAbbreviations.forEach((month, index) => {
        if (cleanDateStr.includes(month)) {
            const monthNumber = (index + 1).toString().padStart(2, '0');
            cleanDateStr = cleanDateStr.replace(month, monthNumber);
            console.log("the cleaned date string: ", cleanDateStr);
        }
    });

  for (const formatStr of dateFormats) {
    try {
      // const parsedDate = parse(cleanDateStr, formatStr, new Date(), { locale: enUS });
      const parsedDate = parse(cleanDateStr, formatStr, new Date());
      if (!isNaN(parsedDate)) {
        if (checkGreaterThan12(parsedDate)) {
          console.log(`month or day value greater than 12: ${dateStr}`);
        //   return false;
          return format(parsedDate, 'yyyy-MM-dd');
        }
        // return format(parsedDate, 'yyyy-MM-dd');
        if (!US) {
          const month = parsedDate.getMonth() + 1; // getMonth() returns 0-11, so +1 to make it 1-12
          const day = parsedDate.getDate(); // getDate() returns 1-31
          const year = parsedDate.getFullYear(); // getFullYear() returns 4-digit year
          return format(`${year}-${day}-${month}`, 'yyyy-MM-dd'); // if not US, swap day and month
        }
        return parsedDate;
      }
    } catch (error) {
      // Log the error for debugging
      console.error(`Error parsing ${cleanDateStr} with format ${formatStr}:`, error);
    }
  }

  // If the first normalization didn't work, apply the second normalization
  cleanDateStr = dateStr.replace(/[\s-]+/g, ' ').trim();

  for (const formatStr of dateFormats) {
    try {
      const parsedDate = parse(cleanDateStr, formatStr, new Date());
      if (!isNaN(parsedDate)) {
        if (checkGreaterThan12(parsedDate)) {
          console.log(`month or day value greater than 12: ${dateStr}`);
        //   return false;
            return format(parsedDate, 'yyyy-MM-dd');
        }
        // console.log(format(parsedDate, 'yyyy-MM-dd'));
        if (!US) {
          const month = parsedDate.getMonth() + 1; // getMonth() returns 0-11, so +1 to make it 1-12
          const day = parsedDate.getDate(); // getDate() returns 1-31
          const year = parsedDate.getFullYear(); // getFullYear() returns 4-digit year
          return format(`${year}-${day}-${month}`, 'yyyy-MM-dd');  // if not US, swap day and month
        }
        return parsedDate;
      }
    } catch (error) {
      // Log the error for debugging
      console.error(`Error parsing ${cleanDateStr} with format ${formatStr}:`, error);
    }
  }

  console.log(`Unrecognized format: ${cleanDateStr}`);
  // return `Unrecognized format: ${dateStr}`;
  return false;

}

function checkGreaterThan12(parsedDate) {
  if (parsedDate instanceof Date && !isNaN(parsedDate)) {
    // Extracting the month and day from the parsed date
    const month = parsedDate.getMonth() + 1; // getMonth() returns 0-11, so +1 to make it 1-12
    const day = parsedDate.getDate(); // getDate() returns 1-31
    // Check if month or day is greater than 12
    if (month > 12 || day > 12) {
      return true;
    }
  }
  return false;
}
