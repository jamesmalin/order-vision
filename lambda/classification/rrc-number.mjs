/**
 * Find all RRC numbers in the given text matching the format "3000XXXXXX" (10 digits starting with 3000).
 * @param {string} text - The text to search for RRC numbers.
 * @returns {Array<string>} Array of found RRC numbers or empty array if none found.
 */
export function findRRC(text) {
    if (!text) return [];
    
    try {
        // Format: 10 digits starting with 3000
        // Examples: "3000215379", "ABC3000215379", "3000215379DEF", "ABC3000215379DEF"
        const regex = /3000\d{6}/g;
        const matches = text.match(regex);
        
        return matches || [];
    } catch (error) {
        console.error("An error occurred while validating the RRC number format:", error);
        return [];
    }
}
