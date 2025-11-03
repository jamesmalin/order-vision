import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Path to the index.mjs file
const indexFilePath = path.join('/Users/yoda/Documents/bio-rad/esker-ai', 'index-refactor-attempt.mjs');

// Read environment variables from .env file
const envFilePath = path.join('/Users/yoda/Documents/bio-rad/esker-ai', '.env');
const envFileContent = fs.readFileSync(envFilePath, 'utf8');

// Parse the .env file content
const envVariables = dotenv.parse(envFileContent);

// Get the list of environment variable values
const envVariableValues = Object.values(envVariables);

console.log("Environment variable values:", envVariableValues);

// Read the content of index.mjs
fs.readFile(indexFilePath, 'utf8', (err, data) => {
    if (err) {
        console.error('Error reading index.mjs:', err);
        return;
    }

    // Check if any of the environment variable values are found in index.mjs
    const foundValues = envVariableValues.filter(value => data.includes(value));

    if (foundValues.length > 0) {
        console.log('Found environment variable values in index.mjs:', foundValues);
    } else {
        console.log('No environment variable values found in index.mjs.');
    }
});
