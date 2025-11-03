/**
 * Normalizes email fields (To, Cc) to always be arrays
 * Handles various input formats:
 * - Already an array: ["email@domain.com"] -> ["email@domain.com"]
 * - Empty string: "" -> []
 * - Single email with brackets: "<email@domain.com>" -> ["email@domain.com"]
 * - Comma/semicolon separated: "<a@x.com>;<b@x.com>,<c@x.com>" -> ["a@x.com", "b@x.com", "c@x.com"]
 */
export function normalizeEmailField(field) {
  // If already an array, return as is
  if (Array.isArray(field)) {
    return field;
  }
  
  // If null, undefined, or empty string, return empty array
  if (!field || field === "") {
    return [];
  }
  
  // If it's a string, process it
  if (typeof field === 'string') {
    // Remove angle brackets and split by common separators
    const emails = field
      .replace(/[<>]/g, '') // Remove angle brackets
      .split(/[;,]/) // Split by semicolon or comma
      .map(email => email.trim()) // Trim whitespace
      .filter(email => email.length > 0); // Remove empty strings
    
    return emails;
  }
  
  // If it's some other type, return empty array
  return [];
}

/**
 * Normalizes an email object by ensuring To and Cc are arrays
 */
export function normalizeEmailObject(emailObj) {
  return {
    ...emailObj,
    To: normalizeEmailField(emailObj.To),
    Cc: normalizeEmailField(emailObj.Cc)
  };
}
