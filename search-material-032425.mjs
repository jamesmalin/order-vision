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

// Function to create embedding
async function createEmbedding(openai, input) {
    const embeddingResponse = await openai.embeddings.create({
        model: model,
        input: input,
    });
    return embeddingResponse.data[0].embedding;
}

// Function to initialize Pinecone
async function initializePinecone() {
    const pinecone = new Pinecone({ apiKey: pinecone_api_key });
    const index = pinecone.index(vectorIndexName);
    console.log("Pinecone client and index initialized");
    return index;
}

// Function to search in Pinecone
// async function searchPinecone(index, openai, materialId, material = false, namespace = '', product = false) {
//     // initial embedding
//     let embedding = new Array(1536).fill(0);
//     if (materialId) {
//         try {
//             const ns = index.namespace(namespace);

//             // handle multiple material ids or a single material id
//             const materialIds = Array.isArray(materialId) ? materialId : [materialId];

//             console.log(`Searching for material ids: ${materialIds}`);
//             let foundId;
//             for (let id of materialIds) {
//                 foundId = id;
//                 // if string only contains numbers, remove any prefix 0s
//                 // if material is alphanumeric, keep it as is
//                 // if (/^\d+$/.test(id)) {
//                 //     id = parseInt(id);
//                 // }
//                 console.log(`Searching for material id: ${id}`);
                
//                 // Search for the full material id
//                 let response = await ns.query({
//                     topK: 1,
//                     vector: embedding,
//                     filter: {
//                         "material": { "$eq": id.toString() }
//                     },
//                     includeMetadata: true,
//                     includeValues: false
//                 });

//                 if (response.matches.length > 0) {
//                     console.log("Found material id:", id, foundId);
//                     response.matches[0].id = foundId;
//                     response.matches[0].metadata.material = foundId;
//                     return response.matches;
//                 }

//                 // If material id contains a dash, split and test the first part
//                 if (response.matches.length === 0 && id.toString().includes('-')) {
//                     id = id.toString().split('-')[0].trim();
//                     foundId = id;
//                     console.log(`Searching for split material id: ${id}`);
//                     // if string only contains numbers, remove any prefix 0s
//                     // if material is alphanumeric, keep it as is
//                     // if (/^\d+$/.test(id)) {
//                     //     id = parseInt(id);
//                     // }
//                     response = await ns.query({
//                         topK: 1,
//                         vector: embedding,
//                         filter: {
//                             "material": { "$eq": id.toString() }
//                         },
//                         includeMetadata: true,
//                         includeValues: false
//                     });

//                     if (response.matches.length > 0) {
//                         console.log("Found material id:", id, foundId);
//                         response.matches[0].id = foundId;
//                         response.matches[0].metadata.material = foundId;
//                     }

//                     console.log("Split material id search results:", response.matches);

//                     let materialDescription = response.matches[0]?.metadata?.materialDescription || '';
//                     console.log(materialDescription);

//                     const threshold = 0.70;

//                     if (material && materialDescription) {
                    
//                         // PRIOR TO FEB 4 2025
//                         // console.log(material.toLowerCase(), materialDescription.toLowerCase());
//                         // const similarity = natural.JaroWinklerDistance(
//                         //     material.toLowerCase(),
//                         //     materialDescription.toLowerCase()
//                         // );

//                         // console.log(`Similarity: ${similarity}`);

//                         // if (similarity < threshold) {
//                         //     console.log("Material description does not match");
//                         //     // clear response.matches
//                         //     response.matches = [];
//                         // }   

//                     } else {
//                         console.log("Material or materialDescription is missing");
//                         console.log("material:", material);
//                         console.log("materialDescription:", materialDescription);
//                     }
//                 }

//                 // if (response.matches.length > 0 && product) {
//                 //     const threshold = 0.70;

//                 //     let materialDescription = response.matches[0]?.metadata?.materialDescription || '';
//                 //     console.log(materialDescription);

//                 //     if (material && materialDescription) {
                    
//                 //         console.log(material.toLowerCase(), materialDescription.toLowerCase());
//                 //         const similarity = natural.JaroWinklerDistance(
//                 //             material.toLowerCase(),
//                 //             materialDescription.toLowerCase()
//                 //         );

//                 //         console.log(`Similarity: ${similarity}`);

//                 //         if (similarity < threshold) {
//                 //             console.log("Product does not match");
//                 //             // clear response.matches
//                 //             response.matches = [];
//                 //         }   
//                 //     } else {
//                 //         console.log("Material or product is missing");
//                 //         console.log("material:", material);
//                 //         console.log("product:", materialDescription);
//                 //     }
//                 // }

//                 if (response.matches.length > 0 && product) {
//                     function tokenSetRatio(str1, str2) {
//                         const set1 = new Set(str1.split(/\s+/));
//                         const set2 = new Set(str2.split(/\s+/));

//                         const intersection = [...set1].filter(token => set2.has(token));
//                         const union = [...new Set([...set1, ...set2])];

//                         return (2 * intersection.length) / union.length;
//                     }

//                     const description1 = material;
//                     const description2 = response.matches[0]?.metadata?.materialDescription || '';

//                     const similarity = tokenSetRatio(description1.toLowerCase(), description2.toLowerCase());
//                     console.log(`Token Set Ratio: ${similarity}`);
//                 }

//                 if (response.matches.length > 0) {
//                     console.log("Found material id:", id, foundId);
//                     // response.matches[0].id = id;
//                     // response.matches[0].metadata.material = id;
//                     return response.matches;
//                 }
//             }
//         } catch (error) {
//             console.error("Error searching in Pinecone:", error);
//         }
//     }    
    
//     if (!material) {
//         console.error("No material provided for search");
//         return [];
//     }

//     // Generate embedding for the search text
//     embedding = await createEmbedding(openai, material);
//     try {
//         const ns = index.namespace(namespace);
//         const response = await ns.query({
//             topK: 3,
//             vector: embedding,
//             includeMetadata: true,
//             includeValues: false
//         });
//         return response.matches;
//     } catch (error) {
//         console.error("Error searching in Pinecone:", error);
//     }
// }

// Function to search in Pinecone
async function searchPinecone(index, openai, materialId, material = false, namespace = '', product = false) {
    try {
        const ns = index.namespace(namespace);
        
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
                                const similarity = calculateSimilarity(material, description);
                                console.log(`Description similarity: ${similarity}`);
                            }
                        }

                        // Update match with original ID
                        response.matches[0].id = originalId;
                        response.matches[0].metadata.material = originalId;
                        return response.matches;
                    }
                }
            }
        }

        // If no material ID match found and material description provided, search by embedding
        if (material) {
            const embedding = await createEmbedding(openai, material);
            const response = await ns.query({
                topK: 3,
                vector: embedding,
                includeMetadata: true,
                includeValues: false
            });
            return response.matches;
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