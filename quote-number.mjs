/**
 * Find a quote number in the given text matching the format "QQXXXXXX-CPQXX" or "UQXXXXXX-CPQXX".
 * @param {string} text - The text to search for a quote number.
 * @returns {string} The found quote number or an empty string if not found.
 */
export function findQuoteNumber(text) {
    if (!text) return "";
    
    try {
        // - Formats: "QQXXXXXX-CPQXX" OR "UQXXXXXX-CPQXX"
        // - Examples: "QQ193823-CPQ22" OR "UQ123456-CPQ18"
        const regex = /(QQ|UQ)\d{6}-CPQ\d{2}/;
        const match = text.match(regex);
        
        return match ? match[0] : "";
    } catch (error) {
        console.error("An error occurred while validating the quote number format:", error);
        return "";
    }
}
