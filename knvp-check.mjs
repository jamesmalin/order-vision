import fs from 'fs';

// Load knvp.json synchronously
let knvpData = {};

try {
  const data = fs.readFileSync('./knvp.json', 'utf-8');
  knvpData = JSON.parse(data);
  console.log('knvp.json loaded successfully.');
} catch (error) {
  console.error('Failed to load knvp.json:', error);
}

/**
 * Check the knvp.json for possible matches of a given value.
 * @param {string|number} value - The value to check for in knvp.json.
 * @returns {object|null} The matches for the value, or null if no matches are found.
 */
export function checkKNVP(value) {
  // Convert value to string for consistent key lookup
  const key = String(value);
  return knvpData[key] || [];
}
