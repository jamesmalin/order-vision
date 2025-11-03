import fs from 'fs';
import path from 'path';

const baseDirectoryPath = './us_testing';

try {
    // Read all subdirectories in the base directory
    const subdirectories = fs.readdirSync(baseDirectoryPath, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);
    
    // Collect all numbers across all directories
    const allNumbers = [];
    
    for (const subdirectory of subdirectories) {
        const directoryPath = path.join(baseDirectoryPath, subdirectory);
        
        try {
            // Read all files in the subdirectory
            const files = fs.readdirSync(directoryPath);
            
            // Extract numbers from filenames
            const numbers = files.map(filename => {
                // Split by underscore and get numbers
                const parts = filename.replace('.pdf', '').split('_');
                // Get last two numbers if they exist
                if (parts.length >= 2) {
                    return [
                        parseInt(parts[parts.length - 2]),
                        parseInt(parts[parts.length - 1])
                    ];
                }
                return [];
            }).flat();

            // Add numbers from this directory to the main array
            allNumbers.push(...numbers);
            
        } catch (error) {
            console.error(`Error reading subdirectory ${subdirectory}:`, error);
        }
    }

    // Deduplicate all numbers
    const uniqueNumbers = [...new Set(allNumbers)];
    
    // Output all unique numbers
    console.log('All unique numbers found:', JSON.stringify(uniqueNumbers));

} catch (error) {
    console.error('Error reading base directory:', error);
}
