// search.mjs
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from 'dotenv';
import OpenAI from 'openai';
import axios from "axios";
import natural from 'natural';

dotenv.config();

const pinecone_api_key = process.env.PINECONE_PROD_API_KEY; // MATERIAL_PINECONE_API_KEY
// note: in testing the small embedding performs better than the large embedding for full addresses
// const vectorIndexName = 'sf-ai';
// const namespace = 'materials'; 
const vectorIndexName = 'materials';
// const namespace = 'materials-021125'; 
const namespace = 'materials-061625'; 
const resource = 'bio-sf-ai';
const model = 'text-embedding-3-small'; // text-embedding-3-small, text-embedding-3-large
const apiVersion = '2023-07-01-preview';
const openaiApiKey = process.env.AZURE_API_KEY2;

// // Initialize OpenAI client for embedding generation
// const openai = new OpenAI({
//     apiKey: openaiApiKey,
//     baseURL: `https://${resource}.openai.azure.com/openai/deployments/${model}`,
//     defaultQuery: { 'api-version': apiVersion },
//     defaultHeaders: { 'api-key': openaiApiKey },
// });

// Function to calculate similarity between two strings using multiple metrics
function calculateSimilarityScore(str1, str2) {
    // Normalize strings
    const normalize = str => str.toLowerCase().trim();
    const s1 = normalize(str1);
    const s2 = normalize(str2);
    
    // 1. Levenshtein Distance
    const levenScore = natural.LevenshteinDistance(s1, s2, {
        insertion_cost: 1,
        deletion_cost: 1,
        substitution_cost: 1
    });
    
    // 2. Jaccard Similarity
    const getTokens = str => str.split(/\s+/);
    const set1 = new Set(getTokens(s1));
    const set2 = new Set(getTokens(s2));
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const jaccardScore = intersection.size / (set1.size + set2.size - intersection.size);
    
    // 3. Token Sort Ratio
    const sortTokens = str => getTokens(str).sort().join(' ');
    const sortedScore = natural.JaroWinklerDistance(sortTokens(s1), sortTokens(s2));
    
    // Combine scores (weighted average)
    const normalizedLeven = 1 - (levenScore / Math.max(s1.length, s2.length));
    return (normalizedLeven * 0.3) + (jaccardScore * 0.4) + (sortedScore * 0.3);
}

// Function to initialize Pinecone
async function initializePinecone() {
    const pinecone = new Pinecone({ apiKey: pinecone_api_key });
    const index = pinecone.index(vectorIndexName);
    console.log("Pinecone client and index initialized");
    return index;
}

// Function to extract numeric parts and other variations from material IDs
function extractMaterialVariations(materialId) {
    const variations = [materialId]; // Always include original
    
    // Extract numeric sequences (handles cases like "Bio-Rad3450123" -> "3450123")
    const numericMatches = materialId.toString().match(/\d+/g);
    if (numericMatches) {
        numericMatches.forEach(num => {
            if (num !== materialId.toString() && !variations.includes(num)) {
                variations.push(num);
            }
        });
    }
    
    // Existing dash-split logic
    if (materialId.toString().includes('-')) {
        const dashSplit = materialId.toString().split('-')[0].trim();
        if (!variations.includes(dashSplit)) {
            variations.push(dashSplit);
        }
    }
    
    return variations;
}

// Function to extract potential material IDs from description text
function extractMaterialIdsFromDescription(description) {
    if (!description) return [];
    
    const materialIds = [];
    
    // Pattern 1: Bio-Rad followed by numbers (e.g., "Bio-Rad3450123")
    const bioRadPattern = /bio[-\s]?rad\s*(\d+)/gi;
    let match;
    while ((match = bioRadPattern.exec(description)) !== null) {
        materialIds.push(match[1]);
    }
    
    // Pattern 2: Standalone numbers that look like material IDs (6-8 digits)
    const standaloneNumbers = description.match(/\b\d{6,8}\b/g);
    if (standaloneNumbers) {
        materialIds.push(...standaloneNumbers);
    }
    
    // Pattern 3: Numbers with letters/prefixes (e.g., "VP00323", "Z6S3M/501")
    const alphanumericPattern = /\b[A-Z]{1,3}\d{3,8}[A-Z]?\b/g;
    const alphanumericMatches = description.match(alphanumericPattern);
    if (alphanumericMatches) {
        materialIds.push(...alphanumericMatches);
    }
    
    // Pattern 4: Numbers with slashes or dashes (e.g., "Z6S3M/501")
    const complexPattern = /\b[A-Z0-9]+[\/\-][A-Z0-9]+\b/g;
    const complexMatches = description.match(complexPattern);
    if (complexMatches) {
        materialIds.push(...complexMatches);
    }
    
    // Remove duplicates and return
    return [...new Set(materialIds)];
}


// Function to create embedding using OpenAI
async function createEmbedding(openai, text) {
    try {
        const embeddingResponse = await openai.embeddings.create({
            model: model,
            input: text,
        });
        return embeddingResponse.data[0].embedding;
    } catch (error) {
        console.error("Error creating embedding:", error);
        return null;
    }
}

// Function to search in Pinecone
async function searchPinecone(index, openai, materialId, material = false, namespace = '', product = false, country = null) {
    try {
        const ns = index.namespace(namespace);
        let allMatches = [];
        
        // Search by material ID if provided
        if (materialId) {
            const materialIds = Array.isArray(materialId) ? materialId : [materialId];
            console.log(`Searching for material ids: ${materialIds}`);

            for (let id of materialIds) {
                const originalId = id;
                console.log(`Searching for material id: ${id}`);

                // Get all variations to try (original, numeric parts, dash-split)
                const idsToTry = extractMaterialVariations(id);
                console.log(`Trying variations: ${idsToTry.join(', ')}`);

                for (const searchId of idsToTry) {
                    const response = await ns.query({
                        topK: 1,
                        vector: new Array(1536).fill(0),
                        filter: {
                            "material": { "$eq": searchId.toString() }
                        },
                        includeMetadata: true,
                        includeValues: false
                    });

                    if (response.matches.length > 0) {
                        console.log(`Found material id: ${searchId} (original: ${originalId})`);
                        
                        // If product comparison is requested
                        if (product && material) {
                            const description = response.matches[0]?.metadata?.materialDescription || '';
                            if (description) {
                                const similarity = calculateSimilarityScore(material, description);
                                console.log(`Description similarity: ${similarity}`);
                                // Add similarity score to the match
                                response.matches[0].score = similarity;
                            }
                        }

                        // Update match ID with original search term, but keep the actual material ID in metadata
                        response.matches[0].id = originalId;
                        // Keep the actual material ID that was found in the database
                        // response.matches[0].metadata.material remains as the found material ID
                        allMatches.push(response.matches[0]);
                        break; // Found a match, no need to try other variations for this ID
                    }
                }
            }

            if (allMatches.length > 0) {
                return allMatches;
            }
        }

        // If no material ID match found and material description provided, use semantic search
        if (material) {
            console.log(`No material ID match found. Searching by description: "${material}"`);
            
            // Primary Strategy: Semantic Vector Search
            if (openai) {
                console.log("Performing semantic vector search...");
                const embedding = await createEmbedding(openai, material);
                if (embedding) {
                    // Get more results for better coverage across 300k products
                    const semanticResponse = await ns.query({
                        topK: 20, // Increased from 10 to get more candidates
                        vector: embedding,
                        includeMetadata: true,
                        includeValues: false
                    });
                    
                    const semanticMatches = semanticResponse.matches.map(match => ({
                        ...match,
                        searchType: 'semantic'
                    }));
                    
                    console.log(`Semantic search found ${semanticMatches.length} matches`);
                    
                    // Return top matches - can be adjusted based on needs
                    return semanticMatches.slice(0, 10); // Return top 10 matches
                }
            }
            
            // Fallback: If semantic search fails, use fuzzy text matching
            console.log("Semantic search failed, falling back to fuzzy text matching...");
            const response = await ns.query({
                topK: 1000,
                vector: new Array(1536).fill(0),
                includeMetadata: true,
                includeValues: false
            });

            // Calculate similarity scores for all materials
            const fuzzyMatches = response.matches.map(match => {
                const description = match.metadata.materialDescription || '';
                const similarity = calculateSimilarityScore(material, description);
                return {
                    ...match,
                    score: similarity,
                    searchType: 'fuzzy'
                };
            }).filter(match => match.score > 0.2) // Higher threshold for fuzzy matches
              .sort((a, b) => b.score - a.score)
              .slice(0, 10); // Return top 10 fuzzy matches
            
            console.log(`Fuzzy search found ${fuzzyMatches.length} matches`);
            return fuzzyMatches;
        }

        console.error("No material ID match found and no material description provided");
        return [];

    } catch (error) {
        console.error("Error searching in Pinecone:", error);
        return [];
    }
}

// Country-specific suffix mappings
const COUNTRY_SUFFIXES = {
    'br': 'V',    // Brazil
    'cn': 'CN'    // China
};

// Function to get country-specific material ID variations
function getCountrySpecificIds(materialId, country) {
    const variations = [];
    const id = materialId.toString();
    
    if (!country) return [id];
    
    const countryCode = country.toLowerCase();
    const suffix = COUNTRY_SUFFIXES[countryCode];
    
    if (suffix) {
        // For target countries (Brazil, China, etc.)
        if (id.endsWith(suffix)) {
            // ID already has the target country suffix, prioritize the base ID
            const baseId = id.slice(0, -suffix.length);
            variations.push(baseId);
            variations.push(id); // Keep original as secondary option
        } else {
            // ID doesn't have suffix, add the country-specific version first
            const countrySpecificId = id + suffix;
            variations.push(countrySpecificId);
            variations.push(id); // Keep original as secondary option
        }
    } else {
        // For non-target countries (US, etc.), prioritize base IDs without suffixes
        let hasKnownSuffix = false;
        Object.values(COUNTRY_SUFFIXES).forEach(knownSuffix => {
            if (id.endsWith(knownSuffix)) {
                const baseId = id.slice(0, -knownSuffix.length);
                if (!variations.includes(baseId)) {
                    variations.push(baseId); // Prioritize base ID first
                    hasKnownSuffix = true;
                }
            }
        });
        
        // Add original ID after base IDs for non-target countries
        if (!variations.includes(id)) {
            variations.push(id);
        }
    }
    
    return variations;
}

// Function to get the appropriate country-specific material ID for a found material
function getCountrySpecificMaterialId(foundMaterialId, country) {
    const id = foundMaterialId.toString();
    const countryCode = country.toLowerCase();
    const suffix = COUNTRY_SUFFIXES[countryCode];
    
    if (!suffix) {
        // For non-target countries (US, etc.), try to remove known suffixes
        for (const knownSuffix of Object.values(COUNTRY_SUFFIXES)) {
            if (id.endsWith(knownSuffix)) {
                return id.slice(0, -knownSuffix.length);
            }
        }
        return null; // No change needed
    }
    
    // For target countries (Brazil, China, etc.)
    if (id.endsWith(suffix)) {
        return null; // Already has the correct suffix
    } else {
        // Add the country suffix
        return id + suffix;
    }
}

// Function to search for country-specific versions
async function searchCountrySpecificVersions(index, materialId, namespace, country) {
    try {
        const ns = index.namespace(namespace);
        const materialIds = Array.isArray(materialId) ? materialId : [materialId];
        
        for (let id of materialIds) {
            const countryVariations = getCountrySpecificIds(id, country);
            console.log(`Searching for country-specific versions (${country}): ${countryVariations.join(', ')}`);
            
            // Try each variation
            for (const variation of countryVariations) {
                const response = await ns.query({
                    topK: 1,
                    vector: new Array(1536).fill(0),
                    filter: {
                        "material": { "$eq": variation }
                    },
                    includeMetadata: true,
                    includeValues: false
                });

                if (response.matches.length > 0) {
                    console.log(`Found country-specific version: ${variation} (original: ${id})`);
                    // Update the match to show the original search ID
                    response.matches[0].id = id;
                    return response.matches;
                }
            }
        }
        
        console.log(`No country-specific version found for material ID(s): ${materialIds} (country: ${country})`);
        return [];
    } catch (error) {
        console.error("Error searching for country-specific version:", error);
        return [];
    }
}

// Main function to run search
export async function searchMaterial(index, openai, materialId, material, product=false, country=null, disableAutoExtraction=false) {
    // Auto-extract material IDs from description if none provided (unless disabled)
    let searchMaterialIds = materialId;
    if (!disableAutoExtraction && (!materialId || materialId.length === 0) && material) {
        const extractedIds = extractMaterialIdsFromDescription(material);
        if (extractedIds.length > 0) {
            console.log(`Auto-extracted material IDs from description: ${extractedIds.join(', ')}`);
            searchMaterialIds = extractedIds;
        }
    }
    
    // Specify what to search on
    console.log(`Searching for: ${searchMaterialIds} and "${material}"`);
    
    // Initialize Pinecone index
    // const index = await initializePinecone();

    // Perform search
    const results = await searchPinecone(index, openai, searchMaterialIds, material, namespace, product, country);

    // If we have results and a country is specified, check for country-specific versions
    if (results.length > 0 && country) {
        // Extract the actual material IDs from the found results
        const foundMaterialIds = results.map(result => result.metadata?.material).filter(Boolean);
        
        if (foundMaterialIds.length > 0) {
            console.log(`Found materials: ${foundMaterialIds.join(', ')}, checking for country-specific versions for ${country.toUpperCase()}`);
            
            // Check each found material for country-specific version
            for (const foundMaterialId of foundMaterialIds) {
                console.log(`Processing found material: ${foundMaterialId} for country: ${country}`);
                const countrySpecificId = getCountrySpecificMaterialId(foundMaterialId, country);
                console.log(`Country-specific ID would be: ${countrySpecificId}`);
                
                if (countrySpecificId && countrySpecificId !== foundMaterialId) {
                    console.log(`Checking for country-specific version: ${countrySpecificId}`);
                    
                    const ns = index.namespace(namespace);
                    const response = await ns.query({
                        topK: 1,
                        vector: new Array(1536).fill(0),
                        filter: {
                            "material": { "$eq": countrySpecificId }
                        },
                        includeMetadata: true,
                        includeValues: false
                    });

                    if (response.matches.length > 0) {
                        console.log(`Found country-specific version: ${countrySpecificId}`);
                        // Return the country-specific version instead
                        response.matches[0].id = searchMaterialIds; // Keep original search term
                        return response.matches;
                    } else {
                        console.log(`No country-specific version found for: ${countrySpecificId}`);
                    }
                } else {
                    console.log(`No country-specific change needed for material: ${foundMaterialId}`);
                }
            }
        }
    }

    // // Display search results
    // console.log("Search Results:");
    // results.forEach((result, i) => {
    //     console.log(`Result ${i + 1}:`, result.metadata, "Score:", result.score);
    // });

    return results;
}

// const initialize = await initializePinecone();

// const material = `Medical centrifuge`;
// const results = await searchMaterial(initialize, "232093Vasdf", material);
// console.log(results);
