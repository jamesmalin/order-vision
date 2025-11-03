import fs from 'fs';

const CONFIGS = {
    '1106': {
        output: '1106.json',
        ranges: [
            { start: 'OR0000003432', end: 'OR0000003471' },
            { start: 'OR0000003472', end: 'OR0000003628' }
        ]
    },
    'o3-mini-hi': {
        output: 'o3-mini-hi.json',
        ranges: [
            { start: 'OR0000002838', end: 'OR0000002875' },
            { start: 'OR0000002916', end: 'OR0000003068' }
        ]
    },
    'o3-mini-md': {
        output: 'o3-mini-md.json',
        ranges: [
            { start: 'OR0000002797', end: 'OR0000002835' },
            { start: 'OR0000003081', end: 'OR0000003263' }
        ]
    },
    '4o': {
        output: '4o.json',
        ranges: [
            { start: 'OR0000002876', end: 'OR0000002914' },
            { start: 'OR0000003264', end: 'OR0000003422' }
        ]
    },
    '45': {
        output: '45.json',
        ranges: [
            { start: 'OR0000004034', end: 'OR0000004072' },
            { start: 'OR0000004073', end: 'OR0000004231' }
        ]
    },
    's35': {
        output: 's35.json',
        ranges: [
            { start: 'OR0000003629', end: 'OR0000003668' },
            { start: 'OR0000003669', end: 'OR0000003828' }
        ]
    },
    's37': {
        output: 's37.json',
        ranges: [
            { start: 'OR0000003829', end: 'OR0000003867' },
            { start: 'OR0000003867', end: 'OR0000004030' }
        ]
    }
};

// Helper function to check if a file number is within any of our ranges
function isInRange(fileNumber, ranges) {
    return ranges.some(range => {
        return fileNumber >= range.start && fileNumber <= range.end;
    });
}

function processFiles(config) {
    try {
        // Read and parse the entire JSON file
        const data = JSON.parse(fs.readFileSync('combined.json', 'utf8'));
        
        // Filter files based on our ranges
        const filteredFiles = data.files.filter(file => isInRange(file.file, config.ranges));
        
        // Write filtered results to new file
        const output = {
            files: filteredFiles
        };

        fs.writeFileSync(config.output, JSON.stringify(output, null, 2));
        console.log(`Filtered ${filteredFiles.length} files to ${config.output}`);
    } catch (error) {
        console.error('Error processing files:', error);
    }
}

// Process all configurations
Object.entries(CONFIGS).forEach(([name, config]) => {
    console.log(`\nProcessing ${name}...`);
    processFiles(config);
});
