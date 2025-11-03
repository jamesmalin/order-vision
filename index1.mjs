import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
// import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import DocumentIntelligence, { getLongRunningPoller, isUnexpected } from "@azure-rest/ai-document-intelligence";
import fs from "fs";
import OpenAI from 'openai';
import { Pinecone } from "@pinecone-database/pinecone";
import axios, { all } from 'axios';
import dotenv from 'dotenv';
dotenv.config();

import { translateText  } from "./translate.mjs";
import { searchMaterial } from "./search-material.mjs";

import PriceCalculator from 'ai-calc';
const priceCalculator = new PriceCalculator();
const aiModel = "gpt-4-1106-preview"; // gpt-4-1106-preview, gpt-4o, o1-mini

const AWS = process.env.AWS === 'true';
const Azure = process.env.AZURE === 'true';

const pinecone_api_key = process.env.PINECONE_API_KEY;
const vectorIndexName = 'addresses';
const vectorNamespace = process.env.NAMESPACE || "address_v4_qa_adrc"; // address_default, addresses, name, name_address, address_v2, address_v3_adrc, address_v3_qa_adrc

const nameArray = [];

/** Function to make API call */
// async function getParsedAddress(oneLineAddress) {
//     try {
//         const response = await axios.post('http://34.219.176.221/parse', {
//             address: oneLineAddress,
//             title_case: true
//         }, {
//             headers: {
//                 'accept': 'application/json',
//                 'Content-Type': 'application/json'
//             }
//         });
//         return response.data;
//     } catch (error) {
//         console.log("Error parsing address:", error);
//         return {}; // Return null if the API call fails
//     }
// }

async function getParsedAddress(oneLineAddress) {
    try {
        // go rest docker: options: parse
        // rest docker options: parser, expandparser

        const dockerUsed = 'rest'; // go-rest, rest
        const single = true;
        const request = (dockerUsed === 'rest') ? {
            query: oneLineAddress
        } : {
            address: oneLineAddress,
            title_case: true
        }; // parser, expandparser

        const response = await axios.post('http://34.219.176.221/expandparser', request, {
            headers: {
                'accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (single && dockerUsed === 'rest') {
            console.log("expanded addresses: ", JSON.stringify(response.data));
            const parsedAddress = (dockerUsed === 'rest')
                ? response.data.find(entry => entry.type === 'expansion')
                : response.data;

            return parsedAddress;
        } else {
            return response.data;
        }
    } catch (error) {
        console.error("Error parsing address:", error);
        return null; // Return null if the API call fails
    }
}

/** Pinecone and Embedding Functions */
async function createEmbedding(input) {
    const resource = 'bio-sf-ai';
    const model = 'text-embedding-3-small';
    const apiVersion = '2023-07-01-preview';
    const apiKey = process.env.AZURE_API_KEY2;
    const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: `https://${resource}.openai.azure.com/openai/deployments/${model}`,
        defaultQuery: { 'api-version': apiVersion },
        defaultHeaders: { 'api-key': apiKey },
    });

    const embeddingResponse = await openai.embeddings.create({
        model: model,
        input: input,
    });

    return embeddingResponse.data[0].embedding;
}

async function initializePinecone(pineconeApiKey, indexName) {
    const pinecone = new Pinecone({
        apiKey: pineconeApiKey
    });
    const index = pinecone.index(indexName);
    console.log("Pinecone client and index initialized");
    return index;
}

// async function searchAddress(index, country, postalCode, city, embedding, namespace = '') {
//     const filter = {
//         country: { '$eq': country }
//     };
    
//     // Add postal code filter only if it's defined
//     if (postalCode) {
//         filter.postalCode = { '$eq': postalCode };
//     }

//     if (city) {
//         filter.city = { '$eq': city };
//     }

//     // console.log(country);
//     const response = await index.namespace(namespace).query({
//         topK: 3,
//         vector: embedding,
//         includeMetadata: true,
//         filter: filter
//     });
//     return response.matches;
// }

// async function searchAddress(index, city, postalCode, country, embedding, namespace = '', topK = 3) {
//     // Define filter levels as separate objects without undefined fields
//     const filterLevels = [
//         { country: { '$eq': country }, postalCode: { '$eq': postalCode }, city: { '$eq': city } }, // Most specific: country + postalCode + city
//         { country: { '$eq': country }, postalCode: { '$eq': postalCode } },                         // Next: country + postalCode
//         { country: { '$eq': country } }                                                             // Least specific: country only
//     ];

//     for (const filter of filterLevels) {
//         // Remove filters that are undefined or empty
//         const refinedFilter = Object.fromEntries(
//             Object.entries(filter).filter(([_, v]) => v && v['$eq'] !== undefined)
//         );

//         const response = await index.namespace(namespace).query({
//             topK,
//             vector: embedding,
//             includeMetadata: true,
//             filter: refinedFilter
//         });

//         if (response.matches && response.matches.length > 0) {
//             return response.matches;  // Return matches if found
//         }
//     }

//     // Return empty array if no matches found in any filter level
//     return [];
// }

// async function getCustomer(initialize, name, address, country) {
//     console.log(name);
//     console.log(address);
//     const parsedAddress = await getParsedAddress(address);

//     console.log(parsedAddress);
//     // Convert parsed address object to a string for embedding input
//     const parsedAddressText = parsedAddress 
//         ? Object.values(parsedAddress).filter(Boolean).join(', ')
//         : address; // Fallback to oneLineAddress if parsing fails

//     // Create embedding using the parsed address text
//     let embedding;

//     if (vectorNamespace === 'name') {
//         embedding = await createEmbedding(name);
//     } else if (vectorNamespace === 'name_address') {
//         embedding = await createEmbedding(name + ' ' + parsedAddressText);
//     } else {
//         embedding = await createEmbedding(parsedAddressText);
//     }

//     const searchResults = await searchAddress(initialize, country, embedding, vectorNamespace);
//     console.log(searchResults, searchResults[0].metadata.customer);

//     return searchResults[0].metadata.customer;
// }

// Dec 17, 2024
// async function getCustomer(initialize, type, aiResponse, name, address, street, city, postalCode, country, addressArray, seriesFallback = null, sold_toAddress = null, otherAddress = null) {
//     console.log("name", name);
//     console.log("address", address);
//     console.log("city", city);
//     console.log("postalCode", postalCode);
//     console.log("country", country);

//     if (!address) return "";
    
//     const parsedAddress = await getParsedAddress(address);

//     console.log(parsedAddress);

//     // Create embeddings based on vectorNamespace
//     let nameEmbedding, addressEmbedding;
    
//     // if (vectorNamespace !== "address_v2" && vectorNamespace !== "address_v3_adrc") {
//     //     // Convert parsed address object to a string for embedding input
//     //     const parsedAddressText = parsedAddress 
//     //         ? Object.values(parsedAddress).filter(Boolean).join(', ')
//     //         : address; // Fallback to oneLineAddress if parsing fails

//     //     if (vectorNamespace === 'name') {
//     //         nameEmbedding = await createEmbedding(name);
//     //     } else if (vectorNamespace === 'name_address') {
//     //         nameEmbedding = await createEmbedding(name);
//     //         addressEmbedding = await createEmbedding(parsedAddressText);
//     //     } else {
//     //         addressEmbedding = await createEmbedding(parsedAddressText);
//     //     }
//     //     console.log("address for embedding: ", parsedAddress);
//     // } else if (vectorNamespace === "address_v3_adrc") {
//         addressEmbedding = await createEmbedding(parsedAddress.data);
//         console.log("address for embedding: ", parsedAddress.data);
//     // } else {
//     //     // console.log("address for embedding: ", parsedAddress.data);
//     //     // addressEmbedding = await createEmbedding(parsedAddress.data);

//     //     const level = parsedAddress.parsed.find(entry => entry.label === 'level')?.value || '';
//     //     const unit = parsedAddress.parsed.find(entry => entry.label === 'unit')?.value || '';
//     //     const road = parsedAddress.parsed.find(entry => entry.label === 'road')?.value || '';
//     //     const suburb = parsedAddress.parsed.find(entry => entry.label === 'suburb')?.value || '';
//     //     const city = parsedAddress.parsed.find(entry => entry.label === 'city')?.value || '';
//     //     const postalCode = parsedAddress.parsed.find(entry => entry.label === 'postcode')?.value || ''; // assuming 'postcode' is equivalent to 'postalCode'

//     //     const formattedAddress = `${level} ${unit} ${road} ${suburb} ${city} ${postalCode}`.trim().replace(/\s+/g, ' ');

//     //     console.log("address for embedding: ", formattedAddress);
//     //     addressEmbedding = await createEmbedding(formattedAddress);
//     // }

//     // Determine series requirement based on type
//     let requiredSeries = null;
//     if (type === 'sold_to') {
//         requiredSeries = '1';
//     } else if (type === 'ship_to' || type === 'consignee') {
//         requiredSeries = '2';
//     }
//     // if (seriesFallback) requiredSeries = seriesFallback; // Override with fallback if specified
//     if (seriesFallback !== null && seriesFallback !== undefined) {
//         requiredSeries = seriesFallback;
//     }

//     // Search based on available embeddings
//     let nameSearchResults = [], addressSearchResults = [];

//     console.log("seriesFallback: ", seriesFallback);

//     // const series = null;
    
//     if (nameEmbedding) {
//         // nameSearchResults = await searchAddress(initialize, parsedAddress, street, city, postalCode, country, addressEmbedding, 'addresses', series);
//         nameSearchResults = await searchAddress(initialize, type, parsedAddress, street, city, postalCode, country, addressEmbedding, vectorNamespace, requiredSeries);
//         console.log("name results: ", JSON.stringify(nameSearchResults))
//     }
//     if (addressEmbedding) {
//         // addressSearchResults = await searchAddress(initialize, parsedAddress, street, city, postalCode, country, addressEmbedding, 'addresses', series);
//         addressSearchResults = await searchAddress(initialize, type, parsedAddress, street, city, postalCode, country, addressEmbedding, vectorNamespace, requiredSeries);
//         console.log("address results: ", JSON.stringify(addressSearchResults))
//     }

//     // Combine results and calculate combined similarity scores if both embeddings exist
//     let bestMatch;
//     const nameThreshold = 0.6;
//     const addressThreshold = 0.8;

//     // if (addressEmbedding && nameEmbedding) {
//     //     const combinedResults = [];
    
//     //     // Process address results
//     //     for (const addressResult of addressSearchResults) {
//     //         const addressSimilarity = addressResult.score || 0;
//     //         const addressFlag = addressSimilarity < addressThreshold;
    
//     //         combinedResults.push({
//     //             ...addressResult,
//     //             combinedScore: addressSimilarity,  // Use addressSimilarity as the combinedScore for address results
//     //             source: 'address',
//     //             addressFlag,
//     //             addressSimilarity,
//     //         });
//     //     }
    
//     //     // Process name results
//     //     for (const nameResult of nameSearchResults) {
//     //         const nameSimilarity = nameResult.score || 0;
//     //         const nameFlag = nameSimilarity < nameThreshold;
    
//     //         combinedResults.push({
//     //             ...nameResult,
//     //             combinedScore: nameSimilarity,  // Use nameSimilarity as the combinedScore for name results
//     //             source: 'name',
//     //             nameFlag,
//     //             nameSimilarity,
//     //         });
//     //     }

//     //     console.log(combinedResults);
    
//     //     // Priority sorting logic
//     //     const prioritizedResults = combinedResults.sort((a, b) => {
//     //         // Step 1: Address results above the threshold take precedence
//     //         if (a.source === 'address' && !a.addressFlag) return -1;
//     //         if (b.source === 'address' && !b.addressFlag) return 1;
    
//     //         // Step 2: Name results above the threshold if no address results meet threshold
//     //         if (a.source === 'name' && !a.nameFlag && a.addressFlag) return -1;
//     //         if (b.source === 'name' && !b.nameFlag && b.addressFlag) return 1;
    
//     //         // Step 3: Fallback to highest combined score for results below thresholds
//     //         return b.combinedScore - a.combinedScore;
//     //     });
    
//     //     // The best match after prioritizing based on thresholds
//     //     bestMatch = prioritizedResults[0];
//     // } else {
//     //     // Fallback if only one type of result is present
//     //     bestMatch = nameSearchResults[0] || addressSearchResults[0];
//     // }

//     if (addressEmbedding && nameEmbedding) {
//         const combinedResults = addressSearchResults.map((addressResult, index) => {
//             const nameResult = nameSearchResults[index] || {};
//             const nameSimilarity = nameResult.score || 0;
//             const addressSimilarity = addressResult.score || 0;

//             console.log("name similarity: ", nameSimilarity);
//             console.log("address similarity: ", addressSimilarity);

//             // Set flags based on threshold checks
//             const nameFlag = nameSimilarity < nameThreshold;
//             const addressFlag = addressSimilarity < addressThreshold;

//             // Calculate combined score only if name similarity is above the threshold
//             const combinedScore = !nameFlag
//                 ? 0.4 * nameSimilarity + 0.6 * addressSimilarity  // Include name similarity in combined score
//                 : addressSimilarity;                             // Only use address similarity

//             return {
//                 ...addressResult,
//                 combinedScore,
//                 nameFlag,
//                 addressFlag,
//                 nameSimilarity,
//                 addressSimilarity,
//             };
//         });

//         console.log("combined results: ", JSON.stringify(combinedResults));
        
//         // Sort by highest combinedScore
//         bestMatch = combinedResults.sort((a, b) => b.combinedScore - a.combinedScore)[0];
//     } else {
//         // Fall back if only one is present
//         // bestMatch = nameSearchResults[0] || addressSearchResults[0];

//         // Sort the results and get the highest-scoring match
//         const getBestMatch = (nameSearchResults, addressSearchResults) => {
//             const allResults = [...nameSearchResults, ...addressSearchResults];
            
//             // Sort all results by score in descending order
//             allResults.sort((a, b) => b.score - a.score);
            
//             // Return the highest-scoring match or null if no results
//             return allResults.length > 0 ? allResults[0] : null;
//         };
        
//         bestMatch = getBestMatch(nameSearchResults, addressSearchResults);
        
//         // if (bestMatch) {
//         //     console.log('Best Match:', bestMatch);
//         // } else {
//         //     console.log('No matches found');
//         // }
  
//         if (bestMatch?.metadata?.name1?.trim()
//             && !bestMatch.metadata.name1.toLowerCase().includes("bio-rad") &&
//             !nameArray.includes(bestMatch.metadata.name1)) {
//             nameArray.push(bestMatch.metadata.name1);
//         }
//     }

//     console.log(bestMatch, bestMatch?.metadata.customer);

//     // if (bestMatch && bestMatch.metadata.name1 && bestMatch.metadata.name1.toLowerCase().includes("bio-rad")) {
//     //     console.log("'bio-rad' found in name1 of the top match.");

//     //     // Trigger fallback to series "1" if type is 'ship_to' or 'consignee'
//     //     if ((type === 'ship_to' || type === 'consignee') && !seriesFallback) {
//     //         console.log("Initiating fallback to '1' series for ship_to or consignee.");
            
//     //         // Directly return the result of the fallback search
//     //         return await getCustomer(initialize, type, name, address, street, city, postalCode, country, addressArray, '1');
//     //     } else {
//     //         console.log(type, seriesFallback);
//     //     }
//     // }

//     if (bestMatch && bestMatch.metadata.name1 && bestMatch.metadata.name1.toLowerCase().includes("bio-rad")) {
//         console.log("'bio-rad' found in name1 of the top match.");

//         if (addressArray.length === 0) {
//             return "";
//         }
    
//         // Remove the currently used address from addressArray
//         const currentAddressIndex = addressArray.findIndex(addr => addr === address);
//         if (currentAddressIndex !== -1) {
//             addressArray.splice(currentAddressIndex, 1); // Remove the matching address
//             console.log(`Removed current address from addressArray: ${address}`);
//         } else {
//             console.log(`Current address not found in addressArray: ${address}`);
//         }

//         // if (aiResponse.sold_to_address) {
//         //     // Remove the address matching aiResponse.sold_to_address from addressArray
//         //     const sold_toAddressIndex = addressArray.findIndex(addr => addr === aiResponse.sold_to_address);
//         //     if (sold_toAddressIndex !== -1) {
//         //         addressArray.splice(sold_toAddressIndex, 1); // Remove the matching address
//         //         console.log(`Removed sold_to address from addressArray: ${aiResponse.sold_to_address}`);
//         //     } else {
//         //         console.log(`Sold to address not found in addressArray: ${aiResponse.sold_to_address}`);
//         //     }
//         // }

//         if (aiResponse.sold_to.address) {
//             // Remove the address matching aiResponse.sold_to_address from addressArray
//             const sold_toAddressIndex = addressArray.findIndex(addr => addr === aiResponse.sold_to.address);
//             if (sold_toAddressIndex !== -1) {
//                 addressArray.splice(sold_toAddressIndex, 1); // Remove the matching address
//                 console.log(`Removed sold_to address from addressArray: ${aiResponse.sold_to.address}`);
//             } else {
//                 console.log(`Sold to address not found in addressArray: ${aiResponse.sold_to.address}`);
//             }
//         }
    
//         // Trigger fallback to series "1" if type is 'ship_to' or 'consignee'
//         if ((type === 'ship_to' || type === 'consignee') && !seriesFallback) {
//             console.log("Initiating fallback to '1' series for ship_to or consignee.");
            
//             // Loop through the remaining addresses
//             for (const remainingAddress of addressArray) {
//                 console.log(`Checking remaining address: ${remainingAddress}`);
                
//                 return await getCustomer(initialize, type, aiResponse, name, remainingAddress, street, city, postalCode, country, addressArray, '1');
//             }
//         } else {
//             console.log(type, seriesFallback);
//         }
//     }    

//     if (bestMatch) {
//         const customerNumber = bestMatch.metadata.customer || '';
//         const isOneSeries = customerNumber.toString().startsWith('1');
//         const isTwoSeries = customerNumber.toString().startsWith('2');

//         console.log("Best match customer number: ", customerNumber);

//         // Determine the required series based on type and fallback rules
//         if (type === 'sold_to' && !isOneSeries && !seriesFallback) {
//             console.log("Retrying for sold_to to find 1 series...");
//             return await getCustomer(initialize, type, aiResponse, name, address, street, city, postalCode, country, addressArray, '1');
//         } else if ((type === 'ship_to' || type === 'consignee') && !isTwoSeries && !seriesFallback) {
//             console.log(`Retrying for ${type} to find 2 series, falling back to 1 series...`);
//             return await getCustomer(initialize, type, aiResponse, name, address, street, city, postalCode, country, addressArray, '1');
//         } else if (seriesFallback && !customerNumber.toString().startsWith(seriesFallback)) {
//             console.log(`No matching customer found in ${seriesFallback} series for ${type}.`);
//             return null; // Stop if fallback series is specified but doesn't match
//         }
        
//         console.log(`Matched ${type} customer: ${customerNumber}`);
//         // return bestMatch.metadata.customer;
//         return {customer: bestMatch.metadata.customer, address: bestMatch.metadata.embedding};
//     }

//     // return bestMatch?.metadata.customer || null;
//     return (bestMatch) ? {customer: bestMatch?.metadata.customer, address: bestMatch.metadata.embedding} : null;
// }

async function getCustomer(initialize, type, aiResponse, name, address, street, city, postalCode, country, addressArray, seriesFallback = null, sold_toAddress = null, otherAddress = null) {
    console.log("name", name);
    console.log("address", address);
    console.log("city", city);
    console.log("postalCode", postalCode);
    console.log("country", country);

    if (!address) return "";
    
    const parsedAddress = await getParsedAddress(address);

    console.log(parsedAddress);

    // Create embeddings based on vectorNamespace
    let nameEmbedding, addressEmbedding;
    
    // if (vectorNamespace !== "address_v2" && vectorNamespace !== "address_v3_adrc") {
    //     // Convert parsed address object to a string for embedding input
    //     const parsedAddressText = parsedAddress 
    //         ? Object.values(parsedAddress).filter(Boolean).join(', ')
    //         : address; // Fallback to oneLineAddress if parsing fails

    //     if (vectorNamespace === 'name') {
    //         nameEmbedding = await createEmbedding(name);
    //     } else if (vectorNamespace === 'name_address') {
    //         nameEmbedding = await createEmbedding(name);
    //         addressEmbedding = await createEmbedding(parsedAddressText);
    //     } else {
    //         addressEmbedding = await createEmbedding(parsedAddressText);
    //     }
    //     console.log("address for embedding: ", parsedAddress);
    // } else if (vectorNamespace === "address_v3_adrc") {
    addressEmbedding = await createEmbedding(parsedAddress.data);
    console.log("address for embedding: ", parsedAddress.data);
    // } else {
    //     // console.log("address for embedding: ", parsedAddress.data);
    //     // addressEmbedding = await createEmbedding(parsedAddress.data);

    //     const level = parsedAddress.parsed.find(entry => entry.label === 'level')?.value || '';
    //     const unit = parsedAddress.parsed.find(entry => entry.label === 'unit')?.value || '';
    //     const road = parsedAddress.parsed.find(entry => entry.label === 'road')?.value || '';
    //     const suburb = parsedAddress.parsed.find(entry => entry.label === 'suburb')?.value || '';
    //     const city = parsedAddress.parsed.find(entry => entry.label === 'city')?.value || '';
    //     const postalCode = parsedAddress.parsed.find(entry => entry.label === 'postcode')?.value || ''; // assuming 'postcode' is equivalent to 'postalCode'

    //     const formattedAddress = `${level} ${unit} ${road} ${suburb} ${city} ${postalCode}`.trim().replace(/\s+/g, ' ');

    //     console.log("address for embedding: ", formattedAddress);
    //     addressEmbedding = await createEmbedding(formattedAddress);
    // }

    // Determine series requirement based on type
    let requiredSeries = null;
    if (type === 'sold_to') {
        requiredSeries = '1';
    } else if (type === 'ship_to' || type === 'consignee') {
        requiredSeries = '2';
    }
    // if (seriesFallback) requiredSeries = seriesFallback; // Override with fallback if specified
    if (seriesFallback !== null && seriesFallback !== undefined) {
        requiredSeries = seriesFallback;
    }

    // Search based on available embeddings
    let nameSearchResults = [], addressSearchResults = [];

    console.log("seriesFallback: ", seriesFallback);

    // const series = null;
    
    if (nameEmbedding) {
        // nameSearchResults = await searchAddress(initialize, parsedAddress, street, city, postalCode, country, addressEmbedding, 'addresses', series);
        nameSearchResults = await searchAddress(initialize, type, parsedAddress, street, city, postalCode, country, addressEmbedding, vectorNamespace, requiredSeries);
        console.log("name results: ", JSON.stringify(nameSearchResults))
    }
    if (addressEmbedding) {
        // addressSearchResults = await searchAddress(initialize, parsedAddress, street, city, postalCode, country, addressEmbedding, 'addresses', series);
        addressSearchResults = await searchAddress(initialize, type, parsedAddress, street, city, postalCode, country, addressEmbedding, vectorNamespace, requiredSeries);
        console.log("address results: ", JSON.stringify(addressSearchResults))
    }

    // Combine results and calculate combined similarity scores if both embeddings exist
    let bestMatch;
    const nameThreshold = 0.6;
    const addressThreshold = 0.8;

    // if (addressEmbedding && nameEmbedding) {
    //     const combinedResults = [];
    
    //     // Process address results
    //     for (const addressResult of addressSearchResults) {
    //         const addressSimilarity = addressResult.score || 0;
    //         const addressFlag = addressSimilarity < addressThreshold;
    
    //         combinedResults.push({
    //             ...addressResult,
    //             combinedScore: addressSimilarity,  // Use addressSimilarity as the combinedScore for address results
    //             source: 'address',
    //             addressFlag,
    //             addressSimilarity,
    //         });
    //     }
    
    //     // Process name results
    //     for (const nameResult of nameSearchResults) {
    //         const nameSimilarity = nameResult.score || 0;
    //         const nameFlag = nameSimilarity < nameThreshold;
    
    //         combinedResults.push({
    //             ...nameResult,
    //             combinedScore: nameSimilarity,  // Use nameSimilarity as the combinedScore for name results
    //             source: 'name',
    //             nameFlag,
    //             nameSimilarity,
    //         });
    //     }

    //     console.log(combinedResults);
    
    //     // Priority sorting logic
    //     const prioritizedResults = combinedResults.sort((a, b) => {
    //         // Step 1: Address results above the threshold take precedence
    //         if (a.source === 'address' && !a.addressFlag) return -1;
    //         if (b.source === 'address' && !b.addressFlag) return 1;
    
    //         // Step 2: Name results above the threshold if no address results meet threshold
    //         if (a.source === 'name' && !a.nameFlag && a.addressFlag) return -1;
    //         if (b.source === 'name' && !b.nameFlag && b.addressFlag) return 1;
    
    //         // Step 3: Fallback to highest combined score for results below thresholds
    //         return b.combinedScore - a.combinedScore;
    //     });
    
    //     // The best match after prioritizing based on thresholds
    //     bestMatch = prioritizedResults[0];
    // } else {
    //     // Fallback if only one type of result is present
    //     bestMatch = nameSearchResults[0] || addressSearchResults[0];
    // }

    if (addressEmbedding && nameEmbedding) {
        const combinedResults = addressSearchResults.map((addressResult, index) => {
            const nameResult = nameSearchResults[index] || {};
            const nameSimilarity = nameResult.score || 0;
            const addressSimilarity = addressResult.score || 0;

            console.log("name similarity: ", nameSimilarity);
            console.log("address similarity: ", addressSimilarity);

            // Set flags based on threshold checks
            const nameFlag = nameSimilarity < nameThreshold;
            const addressFlag = addressSimilarity < addressThreshold;

            // Calculate combined score only if name similarity is above the threshold
            const combinedScore = !nameFlag
                ? 0.4 * nameSimilarity + 0.6 * addressSimilarity  // Include name similarity in combined score
                : addressSimilarity;                             // Only use address similarity

            return {
                ...addressResult,
                combinedScore,
                nameFlag,
                addressFlag,
                nameSimilarity,
                addressSimilarity,
            };
        });

        console.log("combined results: ", JSON.stringify(combinedResults));
        
        // Sort by highest combinedScore
        bestMatch = combinedResults.sort((a, b) => b.combinedScore - a.combinedScore)[0];
    } else {
        // Fall back if only one is present
        // bestMatch = nameSearchResults[0] || addressSearchResults[0];

        // Sort the results and get the highest-scoring match
        const getBestMatch = (nameSearchResults, addressSearchResults) => {
            const allResults = [...nameSearchResults, ...addressSearchResults];
            
            // Sort all results by score in descending order
            allResults.sort((a, b) => b.score - a.score);
            
            // Return the highest-scoring match or null if no results
            return allResults.length > 0 ? allResults[0] : null;
        };
        
        bestMatch = getBestMatch(nameSearchResults, addressSearchResults);
        
        // if (bestMatch) {
        //     console.log('Best Match:', bestMatch);
        // } else {
        //     console.log('No matches found');
        // }
  
        if (bestMatch?.metadata?.name1?.trim()
            && !bestMatch.metadata.name1.toLowerCase().includes("bio-rad") &&
            !nameArray.includes(bestMatch.metadata.name1)) {
            nameArray.push(bestMatch.metadata.name1);
        }
    }

    console.log(bestMatch, bestMatch?.metadata.customer);

    // if (bestMatch && bestMatch.metadata.name1 && bestMatch.metadata.name1.toLowerCase().includes("bio-rad")) {
    //     console.log("'bio-rad' found in name1 of the top match.");

    //     // Trigger fallback to series "1" if type is 'ship_to' or 'consignee'
    //     if ((type === 'ship_to' || type === 'consignee') && !seriesFallback) {
    //         console.log("Initiating fallback to '1' series for ship_to or consignee.");
            
    //         // Directly return the result of the fallback search
    //         return await getCustomer(initialize, type, name, address, street, city, postalCode, country, addressArray, '1');
    //     } else {
    //         console.log(type, seriesFallback);
    //     }
    // }

    if (bestMatch && bestMatch.metadata.name1 && bestMatch.metadata.name1.toLowerCase().includes("bio-rad")) {
        console.log("'bio-rad' found in name1 of the top match.");

        if (addressArray.length === 0) {
            return "";
        }
    
        // Remove the currently used address from addressArray
        const currentAddressIndex = addressArray.findIndex(addr => addr === address);
        if (currentAddressIndex !== -1) {
            addressArray.splice(currentAddressIndex, 1); // Remove the matching address
            console.log(`Removed current address from addressArray: ${address}`);
        } else {
            console.log(`Current address not found in addressArray: ${address}`);
        }

        if (aiResponse.sold_to.address) {
            // Remove the address matching aiResponse.sold_to_address from addressArray
            const sold_toAddressIndex = addressArray.findIndex(addr => addr === aiResponse.sold_to.address);
            if (sold_toAddressIndex !== -1) {
                addressArray.splice(sold_toAddressIndex, 1); // Remove the matching address
                console.log(`Removed sold_to address from addressArray: ${aiResponse.sold_to.address}`);
            } else {
                console.log(`Sold to address not found in addressArray: ${aiResponse.sold_to.address}`);
            }
        }
    
        // Trigger fallback to series "1" if type is 'ship_to' or 'consignee'
        if ((type === 'ship_to' || type === 'consignee') && !seriesFallback) {
            console.log("Initiating fallback to '1' series for ship_to or consignee.");
            
            // Loop through the remaining addresses
            for (const remainingAddress of addressArray) {
                console.log(`Checking remaining address: ${remainingAddress}`);
                
                return await getCustomer(initialize, type, aiResponse, name, remainingAddress, street, city, postalCode, country, addressArray, '1');
            }
        } else {
            console.log(type, seriesFallback);
        }
    }    

    if (bestMatch) {
        const customerNumber = bestMatch.metadata.customer || '';
        const isOneSeries = customerNumber.toString().startsWith('1');
        const isTwoSeries = customerNumber.toString().startsWith('2');

        console.log("Best match customer number: ", customerNumber);

        // Determine the required series based on type and fallback rules
        if (type === 'sold_to' && !isOneSeries && !seriesFallback) {
            console.log("Retrying for sold_to to find 1 series...");
            return await getCustomer(initialize, type, aiResponse, name, address, street, city, postalCode, country, addressArray, '1');
        } else if ((type === 'ship_to' || type === 'consignee') && !isTwoSeries && !seriesFallback) {
            console.log(`Retrying for ${type} to find 2 series, falling back to 1 series...`);
            return await getCustomer(initialize, type, aiResponse, name, address, street, city, postalCode, country, addressArray, '1');
        } else if (seriesFallback && !customerNumber.toString().startsWith(seriesFallback)) {
            console.log(`No matching customer found in ${seriesFallback} series for ${type}.`);
            return null; // Stop if fallback series is specified but doesn't match
        }
        
        console.log(`Matched ${type} customer: ${customerNumber}`);
        // return bestMatch.metadata.customer;
        return {customer: bestMatch.metadata.customer, address: bestMatch.metadata.embedding};
    }

    // return bestMatch?.metadata.customer || null;
    return (bestMatch) ? {customer: bestMatch?.metadata.customer, address: bestMatch.metadata.embedding} : null;
}

// async function getCustomer(initialize, type, name, address, city, postalCode, country, seriesFallback = null) {
//     const parsedAddress = await getParsedAddress(address);
//     const parsedAddressText = parsedAddress 
//         ? Object.values(parsedAddress).filter(Boolean).join(', ')
//         : address;

//     // Generate embeddings based on namespace
//     let nameEmbedding, addressEmbedding;
//     if (vectorNamespace === 'name') {
//         nameEmbedding = await createEmbedding(name);
//     } else if (vectorNamespace === 'name_address') {
//         nameEmbedding = await createEmbedding(name);
//         addressEmbedding = await createEmbedding(parsedAddressText);
//     } else {
//         addressEmbedding = await createEmbedding(parsedAddressText);
//     }

//     // Determine series requirement based on type
//     let requiredSeries = null;
//     if (type === 'sold_to') {
//         requiredSeries = '1';
//     } else if (type === 'ship_to' || type === 'consignee') {
//         requiredSeries = '2';
//     }
//     // if (seriesFallback) requiredSeries = seriesFallback; // Override with fallback if specified
//     if (seriesFallback !== null && seriesFallback !== undefined) {
//         requiredSeries = seriesFallback;
//     }

//     // Perform search with embeddings and series filter
//     let nameSearchResults = [], addressSearchResults = [];
//     if (nameEmbedding) {
//         nameSearchResults = await searchAddress(initialize, city, postalCode, country, nameEmbedding, 'name', requiredSeries);
//     }
//     if (addressEmbedding) {
//         addressSearchResults = await searchAddress(initialize, city, postalCode, country, addressEmbedding, 'addresses', requiredSeries);
//     }

//     let bestMatch;
//     const nameThreshold = 0.6;
//     const addressThreshold = 0.8;

//     if (addressEmbedding && nameEmbedding) {
//         const combinedResults = addressSearchResults.map((addressResult, index) => {
//             const nameResult = nameSearchResults[index] || {};
//             const nameSimilarity = nameResult.score || 0;
//             const addressSimilarity = addressResult.score || 0;

//             console.log("name similarity: ", nameSimilarity);
//             console.log("address similarity: ", addressSimilarity);

//             // Set flags based on threshold checks
//             const nameFlag = nameSimilarity < nameThreshold;
//             const addressFlag = addressSimilarity < addressThreshold;

//             // Calculate combined score only if name similarity is above the threshold
//             const combinedScore = !nameFlag
//                 ? 0.4 * nameSimilarity + 0.6 * addressSimilarity  // Include name similarity in combined score
//                 : addressSimilarity;                             // Only use address similarity if name doesn't meet threshold

//             return {
//                 ...addressResult,
//                 combinedScore,
//                 nameFlag,
//                 addressFlag,
//                 nameSimilarity,
//                 addressSimilarity,
//             };
//         });

//         console.log("combined results: ", JSON.stringify(combinedResults));
        
//         // Sort by highest combinedScore
//         // combinedResults.sort((a, b) => b.combinedScore - a.combinedScore);
//         bestMatch = combinedResults[0]; // Select the top entry after sorting

//         if (bestMatch && bestMatch.metadata.name1 && bestMatch.metadata.name1.toLowerCase().includes("bio-rad")) {
//             console.log("'bio-rad' found in name1 of the top match.");
        
//             // Trigger fallback to series "1" if type is 'ship_to' or 'consignee'
//             if ((type === 'ship_to' || type === 'consignee') && !seriesFallback) {
//                 console.log("Initiating fallback to '1' series for ship_to or consignee.");
                
//                 // Directly return the result of the fallback search
//                 return await getCustomer(initialize, type, name, address, city, postalCode, country, '1');
//             } else {
//                 console.log(type, seriesFallback);
//             }
//         }
        
//         console.log("Selected best match after sorting: ", bestMatch);
//     } else {
//         // Fall back if only one type of embedding is present
//         bestMatch = nameSearchResults[0] || addressSearchResults[0];
//     }

//     if (bestMatch) {
//         const customerNumber = bestMatch.metadata.customer || '';
//         const isOneSeries = customerNumber.toString().startsWith('1');
//         const isTwoSeries = customerNumber.toString().startsWith('2');

//         console.log("Best match customer number: ", customerNumber);

//         // Determine the required series based on type and fallback rules
//         if (type === 'sold_to' && !isOneSeries && !seriesFallback) {
//             console.log("Retrying for sold_to to find 1 series...");
//             return await getCustomer(initialize, type, name, address, city, postalCode, country, '1'); // Retry with 1 series for sold_to
//         } else if ((type === 'ship_to' || type === 'consignee') && !isTwoSeries && !seriesFallback) {
//             console.log("Retrying for ship_to/consignee to find 2 series, falling back to 1 series...");
//             return await getCustomer(initialize, type, name, address, city, postalCode, country, '1'); // Retry with 1 series fallback for ship_to/consignee
//         } else if (seriesFallback && !customerNumber.toString().startsWith(seriesFallback)) {
//             console.log(`No matching customer found in ${seriesFallback} series for ${type}.`);
//             return null; // Stop if fallback series is specified but doesn't match
//         }
        
//         console.log(`Matched ${type} customer: ${customerNumber}`);
//         return bestMatch.metadata.customer;
//     }

//     console.log(`No match found for ${type}.`);
//     return null;
// }

// async function getCustomer(initialize, type, name, address, city, postalCode, country, addressArray, seriesFallback = null, sold_toAddress = null, otherAddress = null) {
//     const parsedAddress = await getParsedAddress(address);
//     const parsedAddressText = parsedAddress 
//         ? Object.values(parsedAddress).filter(Boolean).join(', ')
//         : address;

//     // Remove the currently used address from addressArray
//     const filteredAddressArray = addressArray.filter(addr => addr !== address && addr !== sold_toAddress);

//     // Generate embeddings based on namespace
//     let nameEmbedding, addressEmbedding;
//     if (vectorNamespace === 'name') {
//         nameEmbedding = await createEmbedding(name);
//     } else if (vectorNamespace === 'name_address') {
//         nameEmbedding = await createEmbedding(name);
//         addressEmbedding = await createEmbedding(parsedAddressText);
//     } else {
//         addressEmbedding = await createEmbedding(parsedAddressText);
//     }

//     const nameThreshold = 0.6;
//     const addressThreshold = 0.8;

//     // Helper function to search and validate results for a specific series
//     async function searchAndValidate(series) {
//         const nameSearchResults = nameEmbedding ? await searchAddress(initialize, city, postalCode, country, nameEmbedding, 'name', series) : [];
//         const addressSearchResults = addressEmbedding ? await searchAddress(initialize, city, postalCode, country, addressEmbedding, 'addresses', series) : [];

//         const combinedResults = addressSearchResults.map((addressResult, index) => {
//             const nameResult = nameSearchResults[index] || {};
//             const nameSimilarity = nameResult.score || 0;
//             const addressSimilarity = addressResult.score || 0;

//             // Set flags based on threshold checks
//             const nameFlag = nameSimilarity < nameThreshold;
//             const addressFlag = addressSimilarity < addressThreshold;

//             // Calculate combined score only if name similarity is above the threshold
//             const combinedScore = !nameFlag
//                 ? 0.4 * nameSimilarity + 0.6 * addressSimilarity
//                 : addressSimilarity;

//             return {
//                 ...addressResult,
//                 combinedScore,
//                 nameFlag,
//                 addressFlag,
//                 nameSimilarity,
//                 addressSimilarity,
//                 isBioRad: addressResult.metadata?.name1?.toLowerCase().includes("bio-rad") || false
//             };
//         });

//         // Sort results by combinedScore
//         // combinedResults.sort((a, b) => b.combinedScore - a.combinedScore);

//         console.log(combinedResults);

//         // Return the first valid result that meets the thresholds and doesn't contain "bio-rad"
//         return combinedResults;
//     }

//     // Loop through addresses in filteredAddressArray
//     for (const alternativeAddress of [address, ...filteredAddressArray]) {
//         console.log(`Checking address: ${alternativeAddress} with series 2`);
        
//         // First, check series 2
//         let results = await searchAndValidate('2');
//         let bestMatch = results.find(result => !result.isBioRad && !result.nameFlag && !result.addressFlag);
        
//         // Handle cases where "bio-rad" is found or the result is below address threshold
//         if (!bestMatch) {
//             const bioRadResult = results.find(result => result.isBioRad);

//             if (bioRadResult) {
//                 if (bioRadResult.addressSimilarity < addressThreshold) {
//                     console.log("'bio-rad' found with low address similarity; falling back to series 1 for this address.");
//                     results = await searchAndValidate('1');
//                     bestMatch = results.find(result => !result.isBioRad && !result.nameFlag && !result.addressFlag);
//                 } else {
//                     console.log("'bio-rad' found with high address similarity; moving to next address.");
//                     continue; // Skip to the next address if similarity is high
//                 }
//             }
//         }

//         // If still no valid match, try series 1 for the current address
//         if (!bestMatch) {
//             console.log(`No valid match in series 2; checking series 1 for address: ${alternativeAddress}`);
//             results = await searchAndValidate('1');
//             bestMatch = results.find(result => !result.isBioRad && !result.nameFlag && !result.addressFlag);
//         }

//         // If a valid match is found, return it
//         if (bestMatch) {
//             console.log(`Selected best match: ${bestMatch.metadata.customer}`);
//             return bestMatch.metadata.customer;
//         }
//     }

//     console.log(`No match found for ${type} after attempting all addresses.`);
//     return null;
// }

// async function getCustomer(initialize, type, name, address, city, postalCode, country, addressArray, seriesFallback = null, sold_toAddress = null, otherAddress = null) {
//     console.log("address", address);
//     console.log("city", city);
//     console.log("postalCode", postalCode);
//     console.log("country", country);

//     const addressThreshold = 0.7;

//     // Helper function to search for a customer based on series
//     async function searchCustomerWithSeries(currentAddress, series) {
//         // const parsedAddress = await getParsedAddress(currentAddress);
//         // const parsedAddressText = parsedAddress 
//         //     ? Object.values(parsedAddress).filter(Boolean).join(', ')
//         //     : currentAddress;
        
//         // // Create embedding for the address
//         // const addressEmbedding = await createEmbedding(parsedAddressText);

//         const addressEmbedding = await createEmbedding(address);

//         // Perform the search based on address embedding and specified series
//         const addressSearchResults = await searchAddress(initialize, city, postalCode, country, addressEmbedding, 'addresses', series);
        
//         if (addressSearchResults.length === 0) {
//             console.log(`No matches found in series ${series} for address: ${currentAddress}`);
//             return null;
//         } else {
//             console.log(addressSearchResults);
//         }

//         const bestMatch = addressSearchResults[0];
//         const addressSimilarity = bestMatch.score || 0;

//         return { bestMatch, addressSimilarity };
//     }

//     // Step 1: Initial search with series 2 for ship_to or consignee (or seriesFallback if specified)
//     let requiredSeries = seriesFallback || (type === 'sold_to' ? '1' : '2');
//     let { bestMatch, addressSimilarity } = await searchCustomerWithSeries(address, requiredSeries);

//     // Step 2: Check if the initial result is acceptable
//     if (bestMatch && addressSimilarity >= addressThreshold) {
//         console.log("Accepted match:", bestMatch.metadata.customer);
//         return bestMatch.metadata.customer;
//     }

//     // Step 3: Fallback to series 1 for ship_to or consignee if below threshold or no result found in series 2
//     if ((type === 'ship_to' || type === 'consignee') && !seriesFallback) {
//         console.log("Fallback to '1' series for ship_to or consignee.");
//         const fallbackResult = await searchCustomerWithSeries(address, '1');
//         if (fallbackResult && fallbackResult.bestMatch && fallbackResult.addressSimilarity >= addressThreshold) {
//             console.log("Fallback match in series 1:", fallbackResult.bestMatch.metadata.customer);
//             return fallbackResult.bestMatch.metadata.customer;
//         }
//     }

//     console.log(`No suitable match found for ${type} after fallback.`);
//     return null;
// }

// Address only; Nov 5, 2024
// async function getCustomer(initialize, type, name, address, street, city, postalCode, country, addressArray, seriesFallback = null, sold_toAddress = null, otherAddress = null) {
//     city = normalizeCityName(city);
//     street = normalizeStreetName(street);
//     console.log("address", address);
//     console.log("street", street);
//     console.log("city", city);
//     console.log("postalCode", postalCode);
//     console.log("country", country);
//     console.log("addressArray", addressArray);

//     const addressThreshold = 0.75;

//     // Helper function to search for a customer based on series
//     async function searchCustomerWithSeries(currentAddress, series) {
//         // Create embedding for the address
//         const addressEmbedding = await createEmbedding(currentAddress);

//         // Perform the search based on address embedding and specified series
//         const addressSearchResults = await searchAddress(initialize, street, city, postalCode, country, addressEmbedding, 'addresses', series);
        
//         if (addressSearchResults.length === 0) {
//             console.log(`No matches found in series ${series} for address: ${currentAddress}`);
//             return null;
//         } else {
//             console.log(currentAddress);
//             console.log("Address search results:", JSON.stringify(addressSearchResults));
//         }

//         const bestMatch = addressSearchResults[0];
//         const addressSimilarity = bestMatch.score || 0;
//         const isBioRad = bestMatch.metadata.name1 && bestMatch.metadata.name1.toLowerCase().includes("bio-rad");

//         return { bestMatch, addressSimilarity, isBioRad };
//     }

//     // Step 1: Initial search with series 2 for ship_to or consignee (or seriesFallback if specified)
//     let requiredSeries = seriesFallback || (type === 'sold_to' ? '1' : '2');
//     let { bestMatch, addressSimilarity, isBioRad } = await searchCustomerWithSeries(address, requiredSeries);

//     // Step 2: Check if the initial result is acceptable
//     if (bestMatch) {
//         if (addressSimilarity >= addressThreshold) {
//             if (isBioRad) {
//                 console.log("'bio-rad' found above threshold, moving to the next address in addressArray.");
//                 // Move to the next address in addressArray if available
//                 const nextAddress = addressArray.find(addr => addr !== address && addr !== sold_toAddress && addr !== otherAddress);
//                 if (nextAddress) {
//                     return await getCustomer(initialize, type, name, nextAddress, city, postalCode, country, addressArray, seriesFallback, sold_toAddress, otherAddress);
//                 } else {
//                     console.log("No more addresses to try in addressArray.");
//                     return null;
//                 }
//             } else {
//                 console.log("Accepted match:", bestMatch.metadata.customer);
//                 return bestMatch.metadata.customer;
//             }
//         } 
//         // Fallback to series 1 if below threshold and requiredSeries was 2, or if 'bio-rad' is below threshold for ship_to/consignee
//         else if ((requiredSeries === '2' || (isBioRad && type !== 'sold_to')) && !seriesFallback) {
//             console.log("Below threshold or 'bio-rad' found below threshold. Initiating fallback to series '1'.");
//             const fallbackResult = await searchCustomerWithSeries(address, '1');
//             if (fallbackResult && fallbackResult.bestMatch && fallbackResult.addressSimilarity >= addressThreshold) {
//                 console.log("Fallback match in series 1:", fallbackResult.bestMatch.metadata.customer);
//                 return fallbackResult.bestMatch.metadata.customer;
//             }
//         }
//     }

//     console.log(`No suitable match found for ${type} after all attempts.`);
//     return null;
// }

// Address and name; Nov 5, 2024
// async function getCustomer(initialize, type, name, address, city, postalCode, country, addressArray, seriesFallback = null, sold_toAddress = null, otherAddress = null) {
//     console.log("address", address);
//     console.log("city", city);
//     console.log("postalCode", postalCode);
//     console.log("country", country);

//     const nameThreshold = 0.6;
//     const addressThreshold = 0.75;

//     // Generate embeddings for name and address
//     const nameEmbedding = await createEmbedding(name);
//     const addressEmbedding = await createEmbedding(address);

//     // Helper function to search and validate results for a specific series
//     async function searchAndValidate(series) {
//         const nameSearchResults = nameEmbedding ? await searchAddress(initialize, city, postalCode, country, nameEmbedding, 'name', series) : [];
//         const addressSearchResults = addressEmbedding ? await searchAddress(initialize, city, postalCode, country, addressEmbedding, 'addresses', series) : [];

//         const combinedResults = addressSearchResults.map((addressResult, index) => {
//             const nameResult = nameSearchResults[index] || {};
//             const nameSimilarity = nameResult.score || 0;
//             const addressSimilarity = addressResult.score || 0;

//             // Set flags based on threshold checks
//             const nameFlag = nameSimilarity < nameThreshold;
//             const addressFlag = addressSimilarity < addressThreshold;

//             // Calculate combined score only if name similarity is above the threshold
//             const combinedScore = !nameFlag
//                 ? 0.4 * nameSimilarity + 0.6 * addressSimilarity
//                 : addressSimilarity;

//             return {
//                 ...addressResult,
//                 combinedScore,
//                 nameFlag,
//                 addressFlag,
//                 nameSimilarity,
//                 addressSimilarity,
//                 isBioRad: addressResult.metadata?.name1?.toLowerCase().includes("bio-rad") || false
//             };
//         });

//         // Sort results by combinedScore in descending order
//         combinedResults.sort((a, b) => b.combinedScore - a.combinedScore);

//         console.log("Combined Results:", combinedResults);

//         return combinedResults;
//     }

//     // Loop through addresses in addressArray starting with the primary address
//     for (const alternativeAddress of [address, ...addressArray.filter(addr => addr !== address && addr !== sold_toAddress && addr !== otherAddress)]) {
//         console.log(`Checking address: ${alternativeAddress} with series 2`);
        
//         // Check series 2 first for ship_to and consignee types
//         let results = await searchAndValidate('2');
//         let bestMatch = results.find(result => !result.isBioRad && !result.nameFlag && !result.addressFlag);
        
//         // Handle cases where "bio-rad" is found or the result is below address threshold
//         if (!bestMatch) {
//             const bioRadResult = results.find(result => result.isBioRad);

//             if (bioRadResult) {
//                 if (bioRadResult.addressSimilarity < addressThreshold) {
//                     console.log("'bio-rad' found with low address similarity; falling back to series 1 for this address.");
//                     results = await searchAndValidate('1');
//                     bestMatch = results.find(result => !result.isBioRad && !result.nameFlag && !result.addressFlag);
//                 } else {
//                     console.log("'bio-rad' found with high address similarity; moving to next address.");
//                     continue; // Skip to the next address if similarity is high
//                 }
//             }
//         }

//         // If no valid match in series 2, check series 1 for this address
//         if (!bestMatch) {
//             console.log(`No valid match in series 2; checking series 1 for address: ${alternativeAddress}`);
//             results = await searchAndValidate('1');
//             bestMatch = results.find(result => !result.isBioRad && !result.nameFlag && !result.addressFlag);
//         }

//         // If a valid match is found, return it
//         if (bestMatch) {
//             console.log(`Selected best match: ${bestMatch.metadata.customer}`);
//             return bestMatch.metadata.customer;
//         }
//     }

//     console.log(`No match found for ${type} after attempting all addresses.`);
//     return null;
// }

function normalizeCityName(city) {
    const termsToRemove = ["City", "North", "South", "East", "West", "Upper", "Lower", "Greater", "Metro", "Village", "Town", "Borough"];
    const regex = new RegExp(`\\b(${termsToRemove.join("|")})\\b`, "gi");
    return city.replace(regex, "").trim();
}

function normalizeStreetName(cityOrStreet) {
    const directionMap = {
        "North": "N.",
        "South": "S.",
        "East": "E.",
        "West": "W."
    };

    // Create a regex to match the directions and replace with abbreviations
    const regex = new RegExp(`\\b(${Object.keys(directionMap).join("|")})\\b`, "gi");

    return cityOrStreet.replace(regex, (match) => directionMap[match]).trim();
}

async function searchAddress(index, type, parsedAddress, street, city, postalCode, country, embedding, namespace = '', series = null, topK = 3) {
    const scoreThreshold = 0.65;
    const allMatches = [];
    console.log("name array: ", nameArray);
    console.log("parsed address: ", parsedAddress);
    console.log("country: ", country);
    const parsedString = parsedAddress.parsed
        .map(entry => `${entry.label}: ${entry.value}`)
        .join(', ');

    console.log("parsed address parsed: ", parsedString);
    
    // Define filter levels as separate objects without undefined fields
    // const filterLevels = [
    //     { country: { '$eq': country }, postalCode: { '$eq': postalCode }, city: { '$eq': city }, street: { '$eq': street } },  // Most specific: country + postalCode + city + street
    //     { country: { '$eq': country }, postalCode: { '$eq': postalCode }, city: { '$eq': city } },                             // Next: country + postalCode + city
    //     { country: { '$eq': country }, postalCode: { '$eq': postalCode } },                                                    // Next: country + postalCode
    //     { country: { '$eq': country }, city: { '$eq': city }, street: { '$eq': street } },                                     // Next: country + city + street
    //     { country: { '$eq': country }, city: { '$eq': city } },                                                                // Next: country + city
    //     { country: { '$eq': country }, street: { '$eq': street } },                                                            // Next: country + street
    //     { country: { '$eq': country } }                                                                                        // Least specific: country only
    // ];

    // const filterLevels = [
    //     { country: { '$eq': country }, postalCode: { '$eq': postalCode }, city: { '$eq': city } },                             // Next: country + postalCode + city
    //     { country: { '$eq': country }, city: { '$eq': city } },                                                                // Next: country + city
    //     { country: { '$eq': country } }                                                                                        // Least specific: country only
    // ];
    
    let filterLevels = [];
    if (vectorNamespace === 'address_v2' || vectorNamespace === 'address_v3_adrc' || vectorNamespace === 'address_v3_qa_adrc' || vectorNamespace === 'address_v4_qa_adrc') {
        // const parsedMapping = {
        //     // level: 'level',
        //     unit: 'address',
        //     road: 'street',
        //     suburb: 'region',
        //     city: 'city',
        //     postcode: 'postalCode',
        // };
        
        // // Start with name-based filters, then add cascading filters based on parsedAddress
        // filterLevels = nameArray.map(name => ({
        //     name1: { '$eq': name }
        // })).concat(
        //     parsedAddress.parsed.map((_, index, array) => {
        //         // Create a filter using all entries up to the current index
        //         return array.slice(0, index + 1).reduce((filter, entry) => {
        //             const field = parsedMapping[entry.label];
        //             if (field) {
        //                 filter[field] = { '$eq': entry.value };
        //             }
        //             return filter;
        //         }, {});
        //     }).reverse().filter(filter => Object.keys(filter).length > 0) // start with most specific and filter empty objects
        // );

        // "region":{"$eq":"zhongshan district"},"city":{"$eq":"taipei city"},"postalCode":{"$eq":"10478"}
        const hasPostcode = parsedAddress.parsed.find(entry => entry.label === 'postcode');
        const hasCity = parsedAddress.parsed.find(entry => entry.label === 'city');

        // filterLevels = nameArray.map(name => ({
        //     name1: { '$eq': name }
        // })).concat(
        //     (country && hasPostcode && hasCity) ? [{
        //         country: { '$eq': country },
        //         postalCode: { '$eq': hasPostcode.value },
        //         city: { '$eq': hasCity.value }
        //     }] : [],
        //     (country && hasPostcode) ? [{
        //         country: { '$eq': country },
        //         postalCode: { '$eq': hasPostcode.value }
        //     }] : [],
        //     (country && hasCity) ? [{
        //         country: { '$eq': country },
        //         city: { '$eq': hasCity.value }
        //     }] : [],
        //     country ? [{
        //         country: { '$eq': country }
        //     }] : []
        // );
        // filterLevels = [
        //     { country: { '$ne': 'xyz' } }
        // ];
        filterLevels = [
            { country: { '$eq': country } }
        ];
    } else {
        filterLevels = nameArray.map(name => ({ 
            name1: { '$eq': name } 
        })).concat([
            { country: { '$eq': country }, postalCode: { '$eq': postalCode }, city: { '$eq': city } },
            { country: { '$eq': country }, city: { '$eq': city } },
            { country: { '$eq': country } },
            { country: { '$ne': 'xyz' } }
        ]);
    }
    
    console.log("filter levels: ", filterLevels);

    // Add series range filter based on required series
    const seriesRanges = {
        '1': { customer: { '$gte': 1000000, '$lt': 2000000 } }, // "1 series" range
        '2': { customer: { '$gte': 2000000, '$lt': 3000000 } }  // "2 series" range
    };
    const seriesFilter = series ? seriesRanges[series] : {};

    // SERIES FILTER HAS BEEN COMMENTED OUT FROM REFINED FILTER; PRODUCING BAD RESULTS; DO NOT RE-ENABLE
    
    let level = 1; // Start with level 1 for the most specific filter
    for (const filter of filterLevels) {
        console.log(`Applying filter level ${level}:`, JSON.stringify(filter));
        // Merge series filter with location filters
        let refinedFilter = {
            ...Object.fromEntries(
                Object.entries(filter).filter(([_, v]) => v && v['$eq'] !== undefined)
            ),
            ...seriesFilter
        };

        console.log("refined filter: ", refinedFilter);

        // // If filtering on `name1` and current series is "2", add "1 series" range as an OR filter
        // if (filter.name1 && series === '2') {
        //     refinedFilter = {
        //         $or: [
        //             { ...refinedFilter, ...seriesRanges['1'] }, // Include "1 series"
        //             { ...refinedFilter } // Include current "2 series" filter
        //         ]
        //     };
        // }

        const response = await index.namespace(namespace).query({
            topK,
            vector: embedding,
            includeValues: false,
            includeMetadata: true,
            filter: refinedFilter
        });

        console.log(response.matches);

        // Return matches if found with a score above threshold score
        if (response.matches && response.matches.length > 0 && response.matches[0].score >= scoreThreshold) {
            return response.matches;  // Return matches if found
        } else if (response.matches && response.matches.length > 0) {
            if (type !== 'sold_to') {
                allMatches.push(...response.matches);
            }
            if (!parsedAddress.translated) { // Check if it's the first attempt with translation
                const text = parsedAddress.data;
                const target = "en-US";
                const translated = await translateText({ text }, target);
                console.log(`Original: ${text}`);
                console.log(`Translated for new embedding: ${translated}`);
                const addressEmbedding = await createEmbedding(translated);
        
                // Add a flag to indicate that translation has been attempted
                parsedAddress.translated = true;
                parsedAddress.data = translated;
        
                // Try again with translated address
                allMatches.push(...await searchAddress(index, type, parsedAddress, street, city, postalCode, country, addressEmbedding, namespace, series, topK));
            }
        }

        // If no valid matches in "2 series" and `name1` filter exists, try "1 series"
        // THIS MIGHT NOT BE A GOOD IDEA -- NEEDS TESTING
        // PROBLEM IS THAT IT MIGHT FALSE POSITIVE MATCH
        // if (filter.name1 && series === '2') {
        //     console.log("No valid match in '2 series', trying '1 series'...");

        //     refinedFilter = {
        //         ...Object.fromEntries(
        //             Object.entries(filter).filter(([_, v]) => v && v['$eq'] !== undefined)
        //         ),
        //         ...seriesRanges['1'] // Apply "1 series"
        //     };

        //     const response1 = await index.namespace(namespace).query({
        //         topK,
        //         vector: embedding,
        //         includeMetadata: true,
        //         filter: refinedFilter
        //     });

        //     if (response1.matches && response1.matches.length > 0 && response1.matches[0].score >= scoreThreshold) {
        //         return response1.matches; // Return matches if found in "1 series"
        //     } else if (response1.matches && response1.matches.length > 0) {
        //         allMatches.push(...response1.matches);
        //     }
        // }

        level++;
    }

    console.log("no addresses were above the threshold");
    // Return final match array if any matches were found, but none met the threshold
    return allMatches;
}

// async function getCustomer(initialize, type, name, address, city, postalCode, country) {
//     const parsedAddress = await getParsedAddress(address);
//     const parsedAddressText = parsedAddress 
//         ? Object.values(parsedAddress).filter(Boolean).join(', ')
//         : address;

//     let nameEmbedding, addressEmbedding;
//     if (vectorNamespace === 'name') {
//         nameEmbedding = await createEmbedding(name);
//     } else if (vectorNamespace === 'name_address') {
//         nameEmbedding = await createEmbedding(name);
//         addressEmbedding = await createEmbedding(parsedAddressText);
//     } else {
//         addressEmbedding = await createEmbedding(parsedAddressText);
//     }

//     let nameSearchResults = [], addressSearchResults = [];
//     if (nameEmbedding) {
//         nameSearchResults = await searchAddress(initialize, city, postalCode, country, nameEmbedding, 'name');
//     }
//     if (addressEmbedding) {
//         addressSearchResults = await searchAddress(initialize, city, postalCode, country, addressEmbedding, 'addresses');
//     }

//     let bestMatch;
//     const nameThreshold = 0.6;
//     const addressThreshold = 0.8;

//     if (addressEmbedding && nameEmbedding) {
//         const combinedResults = addressSearchResults.map((addressResult, index) => {
//             const nameResult = nameSearchResults[index] || {};
//             const combinedScore = (0.4 * (nameResult.score || 0)) + (0.6 * (addressResult.score || 0));

//             return {
//                 ...addressResult,
//                 combinedScore,
//                 customerNumber: addressResult.metadata.customerNumber,
//             };
//         });

//         bestMatch = combinedResults.sort((a, b) => b.combinedScore - a.combinedScore)[0];
//     } else {
//         bestMatch = nameSearchResults[0] || addressSearchResults[0];
//     }

//     if (bestMatch) {
//         // console.log(bestMatch.metadata, bestMatch.metadata.customer);
//         const customerNumber = bestMatch.metadata.customer || '';
//         const isOneSeries = customerNumber.toString().startsWith('1');
//         const isTwoSeries = customerNumber.toString().startsWith('2');

//         console.log("best match customer number: ", customerNumber);

//         if (type === 'sold_to' && !isOneSeries) {
//             // Sold-to requires 1 series; retry if not matched
//             bestMatch = await retryWithSeriesFallback(type, '1', initialize, name, parsedAddressText, city, postalCode, country);
//         } else if ((type === 'ship_to' || type === 'consignee') && !isTwoSeries) {
//             // Ship-to/Consignee require 2 series; fallback to 1 if no match
//             bestMatch = isTwoSeries ? bestMatch : await retryWithSeriesFallback(type, '1', initialize, name, parsedAddressText, city, postalCode, country);
//         } else {
//             console.log(`Matched ${type} customer: ${customerNumber}`);
//         }
//     }

//     return bestMatch?.metadata.customer || null;
// }

// async function retryWithSeriesFallback(type, series, initialize, name, address, city, postalCode, country) {
//     console.log(`Retrying for ${type} with series ${series} fallback for ${name}, ${address}, ${city}, ${postalCode}, ${country}`);
//     const refinedFilter = { country: { '$eq': country } };

//     const response = await initialize.namespace('name_address').query({
//         topK: 3,
//         vector: await createEmbedding(name + ',' + address),
//         filter: refinedFilter,
//         includeMetadata: true
//     });

//     console.log("Response: ", response.matches);

//     // Manually filter for the required series prefix after querying
//     const matches = response.matches || [];
//     const filteredMatches = matches.filter(match => match.metadata.customer.toString().startsWith(series));

//     return filteredMatches.length > 0 ? filteredMatches[0] : null;
// }

async function fetchDataFromOpenAI(prompt) {
    try {
        let apiKey;
        if (AWS) {
            const secretsManagerClient = new SecretsManagerClient();
            const input = {
                    SecretId: (Azure) ? "AzureOpenAIKey" : "OpenAIKey"
            };
            const command = new GetSecretValueCommand(input);
            const secretsResponse = await secretsManagerClient.send(command);
            const secret = JSON.parse(secretsResponse.SecretString);
            apiKey = (Azure) ? secret.AzureOpenAIKey : secret.key;
        } else {
            apiKey = process.env.OPENAI_API_KEY;
        }

        const resource = 'bio-sf-ai';
        const model = 'sf-ai';
        const apiVersion = '2023-07-01-preview';
        let openai;
        if (Azure) {
            openai = new OpenAI({
                apiKey: apiKey, // defaults to 
                baseURL: `https://${resource}.openai.azure.com/openai/deployments/${model}`,
                defaultQuery: { 'api-version': apiVersion },
                defaultHeaders: { 'api-key': apiKey },
            });
        } else {
            openai = new OpenAI({
                apiKey: apiKey,
            });
        }

        // the sold_to, ship_to, and consignee numbers will come from the list of addresses that are vectorized for address matching
        // we then want to assign the values with greater than X score to the sold_to, ship_to, and consignee numbers
//         const instructions = `# Instructions
// NEVER SELECT BIO-RAD OR CORRESPONDING FOR ANY OF THE FIELDS. IF BIO-RAD IS SELECTED, THEN YOU HAVE SELECTED THE WRONG ONE.

// ## Language Required
// All fields should be translated to English if in another language.

// ## Extract the material number from each value in the array.
// Example: ["1\n1250140\nAminex HPX-87H Column, 300 x 7.8 mm\n1\n38,370\n38,370\n正茂"]
// Output: ["1250140"]

// Example 2: ["147CN\nMyocardial marker quality control\n60\n1704.04\n102242.40\n1003102\n2026/10/31\n1508.00","148CN\nMyocardial marker quality control\n60\n1704.04\n102242.40\n1003103\n2026/10/31\n1508.00"]
// Output: ["147CN", "148CN"]

// ## Extract the sold to, ship to (delivery), and consignee information

// If not available leave empty. Give me the reason for your response for each.

// If consignee not available, use the ship_to information.

// Never use the vendor information for any of the required fields.

// ## Extract the contact person's info for each 

// ## Extract the two-letter country code for each address.

// ## BIO-RAD is the vendor
// Bio-Rad should never be referenced for any of the required fields. If it is, then you grabbed the wrong one.

// ## Extract any remaining addresses from the document. Don't include the Sold_to, ship_to, or consignee addresses already pulled.

// ## Before responding, does Sold_to name, consignee name, or ship_to name contain "Bio-Rad"?
// If so, then you have the wrong one. Select the other address to.

// ## Response
// Use the following JSON object structure:
// {
//     "sold_to": "ACME Corp",
//     "sold_to_address": "1234 Main St, Anytown, USA",
//     "sold_to_address_street": "1234 Main St",
//     "sold_to_address_city": "Anytown",
//     "sold_to_address_postal_code": "12345",
//     "sold_to_address_country": "US",
//     "ship_to_name": "ACME Corp",
//     "ship_to_address": "1234 Main St, Anytown, USA",
//     "ship_to_address_street": "1234 Main St",
//     "ship_to_address_city": "Anytown",
//     "ship_to_address_postal_code": "12345",
//     "ship_to_address_country": "US",
//     "consignee_name": "ACME Corp",
//     "consignee_address": "1234 Main St, Anytown, USA",
//     "consignee_address_street": "1234 Main St",
//     "consignee_address_city": "Anytown",
//     "consignee_address_postal_code": "12345",
//     "consignee_address_country": "US",
//     "contact_person": "John Doe",
//     "contact_email": "",
//     "contact_phone_direct": "",
//     "contact_phone_mobile": "",
//     "materials": ["1234","5678"],
//     "address_array": ["address 1", "address 2", ...]
// }`;

// REMOVED:
// ### Language
// - Translate all fields to English if necessary.
    const instructions = `# Instructions

### Key Rule
- **Never select Bio-Rad** for any field. If Bio-Rad is selected, it's incorrect. Bio-Rad is the vendor and should never be referenced.

### Language
- Keep the original language for all fields. For addresses, provide both the original and English translations.

### Extraction Guidelines
1. **Material Numbers**: Extract material numbers from arrays. Use the header row to help identify the column for material number.
   - Example 1: \`["1\n1250140\nAminex HPX-87H Column, 300 x 7.8 mm\n1\n38,370\n38,370\n正茂"]\` => \`["1250140"]\`
   - Example 2: \`["147CN\nMyocardial marker quality control\n...\n1003102", "148CN\nMyocardial marker quality control\n...\n1003103"]\` => \`["147CN", "148CN"]\`

2. **Batch Numbers**: Extract batch numbers from arrays. Use the header row to help identify the column for batch number.

3. **Sold To, Ship To, and Consignee**: Extract these fields. If unavailable, leave empty. Provide the reason for each address.  
   - Only select the address for address, don't include the name of the business.
   - Use \`ship_to\` info if \`consignee\` is missing.  
   - Never use vendor info (e.g., Bio-Rad).

4. **Contact Person For Delivery**: Extract contact details (name, email, phone). Leave blank for missing info.

5. **Account Manager**: Extract account manager details.

6. **Country Code**: Extract two-letter codes from addresses.

7. **Other Addresses**: Extract remaining addresses excluding \`sold_to\`, \`ship_to\`, or \`consignee\`.

8. **Bio-Rad Check**: If \`sold_to\`, \`ship_to\`, or \`consignee\` contains "Bio-Rad", select a different address.

### Response Format
Use this JSON structure:
{
    "sold_to": {
        "name": "ACME Corp",
        "address": "1234 Main St, Anytown, USA",
        "address_english": "1234 Main St, Anytown, USA",
        "address_reason": "value",
        "address_street": "1234 Main"
        "address_city": "Anytown",
        "address_postal_code": "12345",
        "address_country": "US"
    },
    "ship_to": {
        "name": "ACME Corp",
        "address": "1234 Main St, Anytown, USA",
        "address_english": "1234 Main St, Anytown, USA",
        "address_reason": "value",
        "address_street": "1234 Main",
        "address_city": "Anytown",
        "address_postal_code": "12345",
        "address_country": "US"
    },
    "consignee": {
        "name": "ACME Corp",
        "address": "1234 Main St, Anytown, USA",
        "address_english": "1234 Main St, Anytown, USA",
        "address_reason": "value",
        "address_street": "1234 Main",
        "address_city": "Anytown",
        "address_postal_code": "12345",
        "address_country": "US"
    },
    "account_manager": {
        "name": "John Doe",
        "email": "",
        "phone_direct": "",
        "phone_mobile": ""
    },
    "consignee_contact": {
        "name": "John Doe",
        "email": "",
        "phone_direct": "",
        "phone_mobile": ""
    },
    "ship_to_contact": {
        "name": "John Doe",
        "email": "",
        "phone_direct": "",
        "phone_mobile": ""
    },
    "materials": ["1234","5678"],
    "batch_numbers": ["1234","5678"],
    "address_array": ["address 1", "address 2", ...]
}`;

// {
//     "account_manager": {
//         "name": "John Doe",
//         "email": "",
//         "phone": ""
//     },
//     "sold_to": {
//         "name": "ACME Corp",
//         "address": "1234 Main St, Anytown, USA",
//         "address_english": "1234 Main St, Anytown, USA",
//         "address_reason": "value",
//         "address_street": "1234 Main"
//         "address_city": "Anytown",
//         "address_postal_code": "12345",
//         "address_country": "US"
//     },
//     "sold_to": "ACME Corp",
//     "sold_to_address": "1234 Main St, Anytown, USA",
//     "sold_to_address_english": "1234 Main St, Anytown, USA",
//     "sold_to_address_reason": "value",
//     "sold_to_address_street": "1234 Main St",
//     "sold_to_address_city": "Anytown",
//     "sold_to_address_postal_code": "12345",
//     "sold_to_address_country": "US",
//     "ship_to_name": "ACME Corp",
//     "ship_to_address": "1234 Main St, Anytown, USA",
//     "ship_to_address_english": "1234 Main St, Anytown, USA",
//     "ship_to_address_reason": "value",
//     "ship_to_address_street": "1234 Main St",
//     "ship_to_address_city": "Anytown",
//     "ship_to_address_postal_code": "12345",
//     "ship_to_address_country": "US",
//     "consignee_name": "ACME Corp",
//     "consignee_address": "1234 Main St, Anytown, USA",
//     "consignee_address_english": "1234 Main St, Anytown, USA",
//     "consignee_address_reason": "value",
//     "consignee_address_street": "1234 Main St",
//     "consignee_address_city": "Anytown",
//     "consignee_address_postal_code": "12345",
//     "consignee_address_country": "US",
//     "contact_person": "John Doe",
//     "contact_email": "",
//     "contact_phone_direct": "",
//     "contact_phone_mobile": "",
//     "materials": ["1234","5678"],
//     "batch_numbers": ["1234","5678"],
//     "address_array": ["address 1", "address 2", ...]
// }

    const response = await openai.chat.completions.create({
    model: aiModel,
    messages: [
        {"role": "system", "content": instructions},
        // {"role": "assistant", "content": "You are a linguistic specialist. Always translate all JSON fields to English if in another language."},
        {"role": "user", "content": prompt}
    ],
    response_format: { type: 'json_object' }
    });
    // AI is bad at translating, so don't ask it to translate. If anything we can send to a translation service.
    // Also, it should test both. Keep the address in chinese and also translate it to english to see which one is a better match.
    const openAIPrice = priceCalculator.calculateTokenPrice(aiModel, response.usage);
    console.log("openAIPrice: ", openAIPrice);
    const aiResponse = response.choices[0].message.content.trim();
    return aiResponse;
    } catch (e) {
      console.log("error getting image response: ", e);
    }
}

/* function to process invoice in Azure
    input: PDF
    output: result
*/
async function azureProcessing(PDF, model) {
    let key;
    const endpoint = process.env.AZURE_INVOICE_PARSER_ENDPOINT;
    if (AWS) {
        const secretsManagerClient = new SecretsManagerClient();
        const input = {
        SecretId: "azureAIFormRecognizerParserKey"
        };
        const command = new GetSecretValueCommand(input);
        const response = await secretsManagerClient.send(command);
        const secret = JSON.parse(response.SecretString);
        key = secret.ParserKey;
    } else {
        key = process.env.AZURE_INVOICE_PARSER_KEY;
    }

    // ai-form-recognizer
    // const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));
    
    // // first 2 pages only
    // const poller = await client.beginAnalyzeDocument("prebuilt-invoice", PDF, 
    //     {
    //         // pages:"1-2",
    //         features:["KeyValuePairs"]
    //         // locale: "en-US"
    //     }
    // );
    // return await poller.pollUntilDone();

    // ai-document-intelligence
    const client = DocumentIntelligence(endpoint, {
    	key: key,
    });

    const modelId = model; // "prebuilt-invoice", "prebuilt-layout";
    const initialResponse = await client
    	.path("/documentModels/{modelId}:analyze", modelId)
    	.post({
    		contentType: "application/json",
    		body: {
    			base64Source: PDF,
    		// 	urlSource:
    // "https://raw.githubusercontent.com/Azure/azure-sdk-for-js/6704eff082aaaf2d97c1371a28461f512f8d748a/sdk/formrecognizer/ai-form-recognizer/assets/forms/Invoice_1.pdf",
    		},
    		queryParameters: { 
                features: ["KeyValuePairs"], 
                // locale: "en-US", 
                // pages: "1-2"
            }
    	});
    	if (isUnexpected(initialResponse)) {
    		throw initialResponse.body.error;
    	}
    const poller = await getLongRunningPoller(client, initialResponse, {
    	onProgress: (state) => {
    		console.log(`status: ${state.status}`);
    	}
    });

    return (await poller.pollUntilDone()).body.analyzeResult;
}

function toLowerCaseDeep(obj) {
    if (Array.isArray(obj)) {
        return obj.map(toLowerCaseDeep);
    } else if (obj && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj).map(([key, value]) => [key, toLowerCaseDeep(value)])
        );
    } else if (typeof obj === 'string') {
        return obj.toLowerCase();
    }
    return obj;
}

async function finalAddressCheckOpenAI(aiResponse) {
    const addresses = {"sold_to": aiResponse.sold_to, "ship_to": aiResponse.ship_to, "consignee": aiResponse.consignee};
    console.log("final address check: ", addresses);
    return aiResponse;
    const instructions = `# Instructions

    ## Address Check
    Check if the addresses are close to the original addresses. If they are not use false. If they are close use true.
    The entry to compare is the address/address_english to the number.address. If number is null, then respond false.

    ## Response
    Use the following JSON object structure:
    {
        "sold_to": true,
        "ship_to": true,
        "consignee": true
    }`;

    const prompt = `${JSON.stringify(addresses)}`;
    
    try {
        let apiKey;
        if (AWS) {
            const secretsManagerClient = new SecretsManagerClient();
            const input = {
                    SecretId: (Azure) ? "AzureOpenAIKey" : "OpenAIKey"
            };
            const command = new GetSecretValueCommand(input);
            const secretsResponse = await secretsManagerClient.send(command);
            const secret = JSON.parse(secretsResponse.SecretString);
            apiKey = (Azure) ? secret.AzureOpenAIKey : secret.key;
        } else {
            apiKey = process.env.OPENAI_API_KEY;
        }

        const resource = 'bio-sf-ai';
        const model = 'sf-ai';
        const apiVersion = '2023-07-01-preview';
        let openai;
        if (Azure) {
            openai = new OpenAI({
                apiKey: apiKey, // defaults to 
                baseURL: `https://${resource}.openai.azure.com/openai/deployments/${model}`,
                defaultQuery: { 'api-version': apiVersion },
                defaultHeaders: { 'api-key': apiKey },
            });
        } else {
            openai = new OpenAI({
                apiKey: apiKey,
            });
        }

        const response = await openai.chat.completions.create({
        model: aiModel,
        messages: [
            {"role": "system", "content": instructions},
            {"role": "user", "content": prompt}
        ],
        response_format: { type: 'json_object' }
        });
        // AI is bad at translating, so don't ask it to translate. If anything we can send to a translation service.
        // Also, it should test both. Keep the address in chinese and also translate it to english to see which one is a better match.
        const openAIPrice = priceCalculator.calculateTokenPrice(aiModel, response.usage);
        console.log("openAIPrice: ", openAIPrice);
        const aiAddressCheckResponse = response.choices[0].message.content.trim();
        console.log("aiAddressCheckResponse: ", aiAddressCheckResponse);
        const checkResponse = JSON.parse(aiAddressCheckResponse);

        // THIS IS A TEMP SOLUTION; SHOULD BE CHECKED AT THE getCustomer FUNCTION
        // AFTER THE getCustomer FUNCTION, WE CAN JUST USE THE EXISTING LOGIC AFTER THE FUNCTION
        // ONCE IMPLEMENTED, REMOVE THE IF STATEMENTS BELOW
        if (checkResponse.sold_to === false) {
            aiResponse.sold_to = {};
            console.log("sold_to removed");
        }
        if (checkResponse.ship_to === false) {
            aiResponse.ship_to = {};
            console.log("ship_to removed");
        }
        if (checkResponse.consignee === false) {
            aiResponse.consignee = {};
            console.log("consignee removed");
        }
        if (checkResponse.ship_to === true && checkResponse.consignee === false) {
            aiResponse.consignee = aiResponse.ship_to;
            console.log("consignee updated to ship_to");
        }
        if (checkResponse.ship_to === false && checkResponse.consignee === true) {
            aiResponse.ship_to = aiResponse.consignee;
            console.log("ship_to updated to consignee");
        }
        console.log("final address check response: ", aiResponse);
        return aiResponse;
    } catch (e) {
        console.log("error getting image response: ", e);
    }
}

/* main function
    input: event, callback
    output: response
*/
async function main(event, callback) {
    const initialize = await initializePinecone(pinecone_api_key, vectorIndexName);
    let PDF = (event && event.body) ? event.body : false;
    if (AWS) {
        // ai-form-recognizer
        // PDF = Buffer.from(PDF, "base64");

        // ai-document-intelligence
        // can just be assigned to the event body
    } else {
        // const filePath = './qa_testing/Batch and Account Manager.pdf';
        const filePath = '/Users/yoda/downloads/soldto_shipto testing_1 1.pdf';

        // ai-form-recognizer
        // PDF = fs.createReadStream(filePath);
        
        // ai-document-intelligence
        PDF = await fs.promises.readFile(filePath, {encoding: 'base64'});
    }

    if (!PDF) {
        console.log("No PDF received.");
        return {
            statusCode: 200,
            body: JSON.stringify("No PDF received."),
        };
    }

    let resultLayout = await azureProcessing(PDF, "prebuilt-layout");
    let resultContent = "";
    if (resultLayout) {

        console.log('full resultLayout:', JSON.stringify(resultLayout));
        const paragraphs = getParagraphs(resultLayout.paragraphs);
        try {
            let finalTables = [];
            try {
                finalTables = await createTables(resultLayout.tables);
            } catch (e) {
                console.log("error forming tables: ", finalTables);
            }
            // resultContent = `**Paragraphs**:\n${JSON.stringify(paragraphs)}\n\n**Tables**:\n${JSON.stringify(finalTables)}\n\n**Everything else**:\n${JSON.stringify(resultLayout.content)}`;
            resultContent = `**Paragraphs**:\n${JSON.stringify(paragraphs)}\n\n**Tables**:\n${JSON.stringify(finalTables)}`;
            // console.log("Content:\n", resultContent);
        }
        catch (e) {
            console.log("Error in processing: ", e);
        }
    }

    let resultInvoice = await azureProcessing(PDF, "prebuilt-invoice");
    let invoice, invoiceContent, invoiceResultDocuments, Declaration;
    if (resultInvoice) {
        console.log('full resultInvoice:', JSON.stringify(resultInvoice));

        console.log("Page count:", resultInvoice.pages.length);

        for (const page of resultInvoice.pages) {  // Ensure 'const' or 'let' is used for block scoping
            for (const word of page.words) {
                if (word.content.toLowerCase() === 'declaration') {
                    console.log('Declaration found:', word.content, 'on page:', page.pageNumber);
                    Declaration = {
                        pageNumber: page.pageNumber,
                        content: word.content
                    };
                }
            }
        }

        invoiceResultDocuments = resultInvoice.documents[0];
        invoice = invoiceResultDocuments.fields;
        console.log(invoice.Items);

        const items = getDirectContentValues(invoice.Items);
        console.log("Items: ", items);
        try {
            let finalTables = [];
            try {
                finalTables = await createTables(resultInvoice.tables);
            } catch (e) {
                console.log("error forming tables: ", finalTables);
            }
            // invoiceContent = `**Invoice Items**:\n${JSON.stringify(items)}\n\n**Tables**:\n${JSON.stringify(finalTables)}`;
            invoiceContent = `**Invoice Items**:\n${JSON.stringify(finalTables)}`;
            // console.log("Content:\n", invoiceContent);
        }
        catch (e) {
            console.log("Error in processing: ", e);
        }
    }

    const promptContent = resultContent + '\n\n' + invoiceContent;
    console.log("Prompt Content:\n\n", promptContent);
    const openAIResponse = await fetchDataFromOpenAI(promptContent);
    console.log("OpenAI Response: ", openAIResponse);

    const materials = JSON.parse(openAIResponse).materials;
    const addressArray = JSON.parse(openAIResponse).address_array;

    let aiResponse = (openAIResponse) ? JSON.parse(openAIResponse) : {};
    aiResponse = toLowerCaseDeep(aiResponse);

    // FOR GETCUSTOMER NUMBER IT WILL ALWAYS BE BEST TO GET THE CORRESPONDING NUMBER AND ADDRESS 
    // FROM THE INTERNATIONAL AND STANDARD ADDRESS FOR EACH

    // aiResponse.sold_to_address_customer = await getCustomer(initialize, "sold_to", aiResponse, aiResponse.sold_to_name, aiResponse.sold_to_address, aiResponse.sold_to_address_street, aiResponse.sold_to_address_city, aiResponse.sold_to_address_postal_code, aiResponse.sold_to_address_country, addressArray);
    aiResponse.sold_to_address_customer = (aiResponse.sold_to) ? await getCustomer(initialize, "sold_to", aiResponse, aiResponse.sold_to.name, aiResponse.sold_to.address, aiResponse.sold_to.address_street, aiResponse.sold_to.address_city, aiResponse.sold_to.address_postal_code, aiResponse.sold_to.address_country, addressArray) : null;
    aiResponse.ship_to_address_customer = (aiResponse.ship_to) ? await getCustomer(initialize, "ship_to", aiResponse, aiResponse.ship_to.name, aiResponse.ship_to.address, aiResponse.ship_to.address_street, aiResponse.ship_to.address_city, aiResponse.ship_to.address_postal_code, aiResponse.ship_to.address_country, addressArray) : null;
    aiResponse.consignee_address_customer = (aiResponse.consignee) ? await getCustomer(initialize, "consignee", aiResponse, aiResponse.consignee.name, aiResponse.consignee.address, aiResponse.consignee.address_street, aiResponse.consignee.address_city, aiResponse.consignee.address_postal_code, aiResponse.consignee.address_country, addressArray) : null;
    aiResponse.variation = process.env.VARIATION || vectorNamespace;
    // placeholder
    aiResponse.account_manager = {
        "name": "John Doe",
        "email": "john.doe@abc.com",
        "phone_direct": "1234567890",
        "phone_mobile": "1234567890"
    }
    // add the mapping for the account manager number using getCustomer
    aiResponse.account_manager.number = 1234567890;

    // Note if both are null, it will only log the first one
    if (!aiResponse.ship_to_address_customer && !aiResponse.consignee_address_customer) {
        console.log("No ship_to_address_customer or consignee_address_customer found. Using consignee_address_customer.");
    } else if (!aiResponse.ship_to_address_customer) {
        console.log("No ship_to_address_customer found. Using consignee_address_customer.");
        aiResponse.ship_to_address_customer = aiResponse.consignee_address_customer;
    } else if (!aiResponse.consignee_address_customer) {
        console.log("No consignee_address_customer found. Using ship_to_address_customer.");
        aiResponse.consignee_address_customer = aiResponse.ship_to_address_customer;
    }

    // append the number to customer number to each
    aiResponse.sold_to.number = aiResponse.sold_to_address_customer;
    aiResponse.ship_to.number = aiResponse.ship_to_address_customer;
    aiResponse.consignee.number = aiResponse.consignee_address_customer;

    // final check for addresses
    // ADD AI TO DOUBLE-CHECK ORIGINAL VS NEW TO DETERMINE
    // Todo:
    // - If first (international) does not match, move to translated and check; compare both
    // - compare to address for embedding not parsed address
    aiResponse = await finalAddressCheckOpenAI(aiResponse);

    const { invoiceResultDocuments: updatedResultDocuments, createdVariables } = createVariablesFromJson(aiResponse, invoiceResultDocuments);
    console.log("AI Variables: ", createdVariables);
    console.log("Full result: ", JSON.stringify(updatedResultDocuments));
    console.log(openAIResponse);

    // ai-document-intelligence
    // if (invoice.Items && invoice.Items.valueArray) {
    //     invoice.Items.valueArray = invoice.Items.valueArray.map((item, index) => {
    //         if (materials[index]) {
    //             item.material = materials[index];
    //         }
    //         return item;
    //     });
    // }

    if (invoice.Items && invoice?.Items?.valueArray) {
        const material_pinecone_api_key = process.env.MATERIAL_PINECONE_API_KEY;
        const materialVectorIndexName = 'sf-ai';
        const materialPineconeInitialization = await initializePinecone(material_pinecone_api_key, materialVectorIndexName);
        // Only include items up to the Declaration page if set
        const maxPage = (Declaration) ? (Declaration.pageNumber - 1): resultInvoice?.pages?.length;
        invoice.Items.valueArray = await Promise.all(
            invoice.Items.valueArray.map(async (item, index) => {
                let materialai;
                if (item?.valueObject?.Description?.content) {
                    console.log("Item Description: ", item.valueObject.Description.content);
                    materialai = await searchMaterial(materialPineconeInitialization, item.valueObject.Description.content);
                    console.log("Material AI: ", materialai);
                }
                if (item.boundingRegions.some(region => region.pageNumber <= maxPage)) {
                    if (materials[index]) {
                        item.material = materials[index];
                        // item.materialai = (materialai[0]?.metadata?.material) ? materialai[0].metadata.material : null;
                        item.materialai = (materialai) ? materialai : [];
                    }
                    return item;
                }
                return null; // Return null or undefined to filter it out
            }).filter(item => item !== null) // Remove null items
        );
    }

    if (AWS) {
        console.log(JSON.stringify(invoice));
        return {
            statusCode: 200,
            body: JSON.stringify(invoice),
        };
    } else {
        console.log(JSON.stringify(invoice));
    }
}

// function removeBoundingRegions(data) {
//     if (Array.isArray(data)) {
//       return data.map(removeBoundingRegions);
//     } else if (typeof data === 'object' && data !== null) {
//       return Object.fromEntries(
//         Object.entries(data)
//           .filter(([key]) => key !== 'boundingRegions')
//           .map(([key, value]) => [key, removeBoundingRegions(value)])
//       );
//     } else {
//       return data;
//     }
// }  

// function getContentValues(data) {
//     let contents = [];
  
//     if (Array.isArray(data)) {
//       data.forEach(item => {
//         contents = contents.concat(getContentValues(item));
//       });
//     } else if (typeof data === 'object' && data !== null) {
//       if (data.hasOwnProperty('content')) {
//         contents.push(data.content);
//       }
//       Object.values(data).forEach(value => {
//         contents = contents.concat(getContentValues(value));
//       });
//     }
  
//     return contents;
//   }

// async function createTables(tables) {
//     if (tables.length <= 0) {
//         console.log("No tables were extracted from the document.");
//         return [];
//     } else {
//         // console.log("Tables:");
//         const extractedTables = [];
//         let i = 1;
//         for (const table of tables) {
//             // console.log("Table ", i);
//             // console.log(
//             //     `- Extracted table: ${table.columnCount} columns, ${table.rowCount} rows (${table.cells.length} cells)`
//             // );
    
//             const headers = Array(table.columnCount).fill('');
//             const rows = [];
    
//             for (const cell of table.cells ?? []) {
//                 if (cell.kind === "columnHeader") {
//                     headers[cell.columnIndex] = cell.content;
//                 } else if (cell.kind === "content") {
//                     if (!rows[cell.rowIndex - 1]) {
//                         rows[cell.rowIndex - 1] = Array(table.columnCount).fill('');
//                     }
//                     rows[cell.rowIndex - 1][cell.columnIndex] = cell.content;
//                 }
//             }
            
//             let tableData = '';
//             if (headers.length > 0) {
//                 console.log(headers.join(','));
//                 tableData += headers.join(',') + '\n';
//             }
            
//             for (const row of rows ?? []) {
//                 if (row && row.length > 0) {
//                     console.log(row.join(','));
//                     tableData += row.join(',') + '\n';
//                 }
//             }

//             // extractedTables.push({ headers, rows });
//             extractedTables.push(tableData);
//             i++;
//         }
//         return extractedTables;
//     }
// }

function getParagraphs(data) {
    let paragraphs = [];
    data.forEach(paragraph => {
        paragraphs.push(paragraph.content);
    });
    return paragraphs;
}

// async function createTables(tables) {
//     if (tables.length <= 0) {
//         console.log("No tables were extracted from the document.");
//         return [];
//     }

//     const extractedTables = [];
//     let tableIndex = 1;

//     for (const table of tables) {
//         const headers = Array(table.columnCount).fill('');
//         const rows = Array(table.rowCount).fill(null).map(() => Array(table.columnCount).fill(''));

//         // Populate headers and rows based on the cell content
//         for (const cell of table.cells ?? []) {
//             if (cell.kind === "columnHeader") {
//                 headers[cell.columnIndex] = cell.content.trim(); // Trim to remove any unwanted spaces
//             } else if (cell.kind === "content") {
//                 rows[cell.rowIndex - 1][cell.columnIndex] = cell.content.trim(); // Trim to ensure clean content
//             }
//         }

//         // Format table data as a CSV string
//         let tableData = headers.join(',') + '\n'; // Add headers
//         for (const row of rows) {
//             tableData += row.join(',') + '\n'; // Add each row
//         }

//         extractedTables.push(tableData); // Store the formatted table data
//         // console.log(`Table ${tableIndex}:\n${tableData}`); // Log the formatted table
//         tableIndex++;
//     }

//     return extractedTables;
// }

async function createTables(tables) {
    if (tables.length <= 0) {
        console.log("No tables were extracted from the document.");
        return [];
    }

    const extractedTables = [];

    tables.forEach((table, index) => {
        console.log(`Processing Table ${index + 1}: ${table.rowCount} rows, ${table.columnCount} columns`);

        const headers = Array(table.columnCount).fill('');
        const rows = Array.from({ length: table.rowCount }, () => Array(table.columnCount).fill(''));

        for (const cell of table.cells ?? []) {
            if (cell.kind === "columnHeader" || cell.rowIndex === 0) {
                headers[cell.columnIndex] = cell.content.trim();
            } else {
                rows[cell.rowIndex][cell.columnIndex] = cell.content.trim();
            }
        }

        // Filter out empty rows
        const nonEmptyRows = rows.filter(row => row.some(cell => cell !== ''));

        // Convert table data to CSV format
        let tableData = headers.join(',') + '\n';
        for (const row of nonEmptyRows) {
            tableData += row.join(',') + '\n';
        }

        extractedTables.push(`Table ${index + 1}:\n${tableData}`);
    });

    return extractedTables;
}

function convertSnakeToPascal(snakeCaseString) {
    return snakeCaseString.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
}

function createVariablesFromJson(jsonObject, resultDocuments) {
    const createdVariables = [];

    for (const key in jsonObject) {
        if (jsonObject.hasOwnProperty(key)) {
            const pascalCaseKey = convertSnakeToPascal(key);
            const variableName = `AI${pascalCaseKey}`;
            globalThis[variableName] = jsonObject[key] || "";

            resultDocuments.fields[variableName] = {
                "value": globalThis[variableName]
            };

            createdVariables.push(variableName);
        }
    }

    if (globalThis.AIBankgiroType) {
        globalThis.AIPaymentReference = globalThis.AIBankgiroType;
        resultDocuments.fields.AIPaymentReference = {
            "value": globalThis.AIPaymentReference
        };
        createdVariables.push("AIPaymentReference");
    }

    return { resultDocuments, createdVariables };
}

// ai-form-recognizer
// function getDirectContentValues(data) {
//     let contents = [];
  
//     if (Array.isArray(data)) {
//       data.forEach(item => {
//         if (item.hasOwnProperty('content')) {
//           contents.push(item.content);
//         }
//       });
//     } else if (typeof data === 'object' && data !== null && data.hasOwnProperty('values')) {
//       contents = contents.concat(getDirectContentValues(data.values));
//     }
  
//     return contents;
// } 

// ai-document-intelligence
// function getDirectContentValues(data) {
//     let contents = [];
//     // Check if the data is an array and recursively extract content from each item
//     if (Array.isArray(data)) {
//         data.forEach(item => {
//             if (item.type === 'object' && item.valueObject) {
//                 contents = contents.concat(getDirectContentValues(item.valueObject));
//             } else if (item.type === 'array' && item.valueArray) {
//                 contents = contents.concat(getDirectContentValues(item.valueArray));
//             } else if (item.hasOwnProperty('content')) {
//                 contents.push(item.content);
//             }
//         });
//     } else if (typeof data === 'object' && data !== null) {
//         // If data is an object, iterate over its properties
//         for (let key in data) {
//             if (data[key] && typeof data[key] === 'object') {
//                 // Recursively extract contents from nested objects
//                 contents = contents.concat(getDirectContentValues(data[key]));
//             }
//         }
//     }
//     return contents;
// }
function getDirectContentValues(data) {
    let contents = [];

    if (Array.isArray(data)) {
        data.forEach(item => {
            contents = contents.concat(getDirectContentValues(item));
        });
    } else if (typeof data === 'object' && data !== null) {
        if (data.hasOwnProperty('content')) {
            contents.push(data.content);
        }
        for (let key in data) {
            contents = contents.concat(getDirectContentValues(data[key]));
        }
    }

    return contents;
}
  
/* handler function
    input: event, context, callback
    output: response
*/
export const handler = async (event, context) => {
  try {
    console.time("time");
    const response = await main(event);
    console.timeLog("time");
    return response; // Return the response from main directly
  } catch (error) {
    console.error("An error occurred:", error);
    return {
      statusCode: 500, // Consider using 500 for server errors
      body: JSON.stringify(error.message), // Send back the error message
    };
  }
}

if (!AWS) {
    handler();
}