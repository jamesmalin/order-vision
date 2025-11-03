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
const namespace = 'materials-021125'; 
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

// Function to search in Pinecone
async function searchPinecone(index, openai, materialId, material = false, namespace = '', product = false) {
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

                // Try searching with original ID and split ID (if contains dash)
                const idsToTry = [id];
                if (id.toString().includes('-')) {
                    idsToTry.push(id.toString().split('-')[0].trim());
                }

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

                        // Update match with original ID
                        response.matches[0].id = originalId;
                        response.matches[0].metadata.material = originalId;
                        allMatches.push(response.matches[0]);
                    }
                }
            }

            if (allMatches.length > 0) {
                return allMatches;
            }
        }

        // If no material ID match found and material description provided, search all materials
        if (material) {
            // Get all materials (limited to 1000 for performance)
            const response = await ns.query({
                topK: 1000,
                vector: new Array(1536).fill(0),
                includeMetadata: true,
                includeValues: false
            });

            // Calculate similarity scores for all materials
            const scoredMatches = response.matches.map(match => {
                const description = match.metadata.materialDescription || '';
                const similarity = calculateSimilarityScore(material, description);
                return {
                    ...match,
                    score: similarity
                };
            });

            // Sort by similarity score and return top 3
            return scoredMatches
                .sort((a, b) => b.score - a.score)
                .slice(0, 3);
        }

        console.error("No material ID match found and no material description provided");
        return [];

    } catch (error) {
        console.error("Error searching in Pinecone:", error);
        return [];
    }
}

// Main function to run search
export async function searchMaterial(index, openai, materialId, material, product=false) {
    // Specify what to search on
    console.log(`Searching for: ${materialId} and "${material}"`);
    
    // Initialize Pinecone index
    // const index = await initializePinecone();

    // Perform search
    const results = await searchPinecone(index, openai, materialId, material, namespace, product);

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
