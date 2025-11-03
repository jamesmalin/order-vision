import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
// import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import DocumentIntelligence, { getLongRunningPoller, isUnexpected } from "@azure-rest/ai-document-intelligence";
import fs from "fs";
import OpenAI from 'openai';
import path from "path";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { Pinecone } from "@pinecone-database/pinecone";
import axios, { all } from 'axios';
import dotenv from 'dotenv';
dotenv.config();

import { formatDates } from "./format-dates.mjs";
import { translateText  } from "./translate.mjs";
import { searchMaterial } from "./search-material.mjs";
import { extractMaterials } from './extract-materials.mjs';
import { searchAccountManager } from "./search-accountmanager.mjs";
import { addressSearch } from "./search.mjs";
// import { searchCustomer } from "./search-customer.mjs";
// import { checkKNVP } from "./knvp-check.mjs";
import natural from 'natural';

import PriceCalculator from 'ai-calc';
import { match } from "assert";
const priceCalculator = new PriceCalculator();
const aiModel = "gpt-4-1106-preview"; // gpt-4-1106-preview, gpt-4o, o1-mini

const AWS = process.env.AWS === 'true';
const Azure = process.env.AZURE === 'true';

const pinecone_api_key = process.env.PINECONE_API_KEY;
const vectorIndexName = 'addresses';
const vectorNamespace = process.env.NAMESPACE || "address_v4_prod_adrc"; // address_default, addresses, name, name_address, address_v2, address_v3_adrc, address_v3_qa_adrc, address_v4_qa_adrc

import { azureProcessing } from "./invoice-extract.mjs";

const nameArray = [];

/* Open AI Schemas */
// Define reusable schemas
const AddressSchema = z.object({
    name: z.string(),
    address: z.string(),
    address_english: z.string(),
    address_reason: z.string(),
    address_street: z.string(),
    address_city: z.string(),
    address_postal_code: z.string(),
    address_country_code: z.string(),
});

const ContactSchema = z.object({
    name: z.string(),
    email: z.string(),
    phone_direct: z.string(),
    phone_mobile: z.string(),
});

const CustomFields = z.object({
    purchaseOrder: z.string(),
    orderNumber: z.string(),
    contractNo: z.string(),
});

// Define the full schema
const FullResponseSchema = z.object({
    // sold_to: AddressSchema,
    supplier: AddressSchema,
    ship_to: AddressSchema,
    consignee: AddressSchema,
    // account_manager: ContactSchema,
    // consignee_contact: ContactSchema,
    // ship_to_contact: ContactSchema,
    // materials: z.array(
    //     z.object({
    //         index: z.number(),
    //         materialNumbers: z.array(z.string()),
    //         productName: z.string(),
    //     })
    // ),
    // batch_numbers: z.array(
    //     z.object({
    //         index: z.number(),
    //         batch: z.number(),
    //     })
    // ),
    // address_array: z.array(z.string()),
    // custom_fields: CustomFields,
});
/* Open AI Schemas */

/**
 * Get parsed address from a one-line address string.
 * @param {string} oneLineAddress - The address in a single line format.
 * @returns {Object|null} Parsed address object or null if parsing fails.
 */
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
/**
 * Create embedding for the given input text.
 * @param {string} input - The input text to create embedding for.
 * @returns {Array} Embedding array.
 */
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

/**
 * Initialize Pinecone client and index.
 * @param {string} pineconeApiKey - API key for Pinecone.
 * @param {string} indexName - Name of the Pinecone index.
 * @returns {Object} Initialized Pinecone index.
 */
async function initializePinecone(pineconeApiKey, indexName) {
    const pinecone = new Pinecone({
        apiKey: pineconeApiKey
    });
    const index = pinecone.index(indexName);
    console.log("Pinecone client and index initialized");
    return index;
}

/**
 * Search address in Pinecone index.
 * @param {Object} index - Pinecone index.
 * @param {string} type - Type of customer (sold_to, ship_to, consignee).
 * @param {Object} parsedAddress - Parsed address object.
 * @param {string} street - Street name.
 * @param {string} city - City name.
 * @param {string} postalCode - Postal code.
 * @param {string} country - Country name.
 * @param {Array} embedding - Embedding array.
 * @param {string} namespace - Namespace for the search.
 * @param {string|null} series - Series filter.
 * @param {number} topK - Number of top results to return.
 * @returns {Array} Array of matched results.
 */

// make sure name check is in there
async function searchAddress(index, type, name, translatedName, parsedAddress, street, parsedStreet, city, postalCode, country, embedding, streetEmbedding, namespace = '', series = null, topK = 3) {
    const allMatches = [];
    console.log("name array: ", nameArray);
    console.log("parsed address: ", parsedAddress);
    country = country.toLowerCase();
    console.log("country: ", country);
    let filterLevels = [
        { country: { '$eq': country } }
    ];
    if (country === 'hk') {
        filterLevels.push({ country: { '$eq': 'cn' } });
    }
    
    console.log("filter levels: ", filterLevels);

    const seriesRanges = {
        '1': { customer: { '$gte': 1000000, '$lt': 2000000 } },
        '2': { customer: { '$gte': 2000000, '$lt': 3000000 } }
    };

    const applyFiltersAndQuery = async (filter, seriesFilter) => {
        let refinedFilter = {
            ...Object.fromEntries(
                Object.entries(filter).filter(([_, v]) => v && v['$eq'] !== undefined)
            ),
            ...seriesFilter
        };

        console.log("Refined filter:", refinedFilter);

        const response = await addressSearch(index, parsedAddress.data, name, translatedName, refinedFilter);
        console.log(response);

        // return response;
        
        let streetResponse = [];
        if (streetEmbedding) {
            streetResponse = await addressSearch(index, street, name, translatedName, refinedFilter);
            console.log(streetResponse);
        }

        let parsedStreetResponse = [];
        if (parsedStreet) {
            parsedStreetResponse = await addressSearch(index, parsedStreet, name, translatedName, refinedFilter);
            console.log(parsedStreetResponse);
        }

        // Combine the results from both searches
        return [...response, ...streetResponse, ...parsedStreetResponse];
    };

    console.log("type: ", type);
    let seriesList = type === "ship_to" ? ["2", "1"] : [series];
    console.log("series list: ", seriesList);
    for (const currentSeries of seriesList) {
        console.log(`Processing series: ${currentSeries}`);
        const seriesFilter = currentSeries ? seriesRanges[currentSeries] : {};
        let level = 1;
        for (const filter of filterLevels) {
            console.log(`Applying filter level ${level}:`, JSON.stringify(filter));
            const response = await applyFiltersAndQuery(filter, seriesFilter);

            if (response && response.length > 0) {
                allMatches.push(...response);
                if (!parsedAddress.translated) {
                    const text = parsedAddress.data;
                    const target = "en-US";
                    let translated = await translateText({ text }, target);
                    if (translated.translations[0].detectedLanguageCode !== 'en') {
                        translated = translated.translations[0].translatedText;
                        console.log(`Original: ${text}`);
                        console.log(`Translated for new embedding: ${translated}`);
                        const addressEmbedding = await createEmbedding(translated);

                        parsedAddress.translated = true;
                        parsedAddress.data = translated;

                        const translatedMatches = await searchAddress(
                            index,
                            type,
                            name,
                            translatedName,
                            parsedAddress,
                            street,
                            parsedStreet,
                            city,
                            postalCode,
                            country,
                            addressEmbedding,
                            "",
                            namespace,
                            currentSeries,
                            topK
                        );
                        allMatches.push(...translatedMatches);
                    } else {
                        console.log(`No translation needed for: ${text}`);
                    }
                }
            }
            level++;
        }
    }

    console.log("no addresses were above the threshold");
    
    return allMatches;
}

async function fetchCustomerFromOpenAI(model = "sf-ai", apiVersion = "2023-07-01-preview", prompt) {
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
            if (Azure) {
                apiKey = process.env.AZURE_API_KEY2;
            } else {
                apiKey = process.env.OPENAI_API_KEY;
            }
        }

        const resource = 'bio-sf-ai';
        // const model = 'sf-ai';
        // const apiVersion = '2023-07-01-preview';
        // const model = 'gpt-4o';
        // const apiVersion = '2024-08-01-preview';
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

        const instructions = `# Instructions

### Key Rule
- Never select Bio-Rad for any field. If Bio-Rad is selected, it's incorrect. Bio-Rad is the vendor and should never be referenced.

### Language
- Keep the original language for all fields. For addresses, provide both the original and English translations.

### Extraction Guidelines
1. Supplier, Ship To, and Consignee: Extract these fields.  
    - The \`name\` and \`address\` fields are crucial and must always be extracted if available.  
    - If \`name\` is missing, leave it blank but ensure the address is still extracted.    
    - Only if a name is in English, extract the English name in the \`name_english\` field.
    - Only select the address for address fields; do not include the name of the business in the address.  
    - Use \`ship_to\` information if \`consignee\` is missing.  
    - Never use vendor information (e.g., Bio-Rad).  
    - Note: \`supplier\` can appear as Distributor or similar as well. As long as it's not Bio-Rad, this is correct.
    - For country codes, extract the two-letter code from the address.

### Required Response Format
Note: If info is missing, leave it blank with "".
Use this JSON structure:
{
    "supplier": {
        "name": "ACME Corp",
        "name_english": "ACME Corp",
        "address": "1234 Main St, Anytown, USA",
        "address_english": "1234 Main St, Anytown, USA",
        "address_reason": "value",
        "address_street": "1234 Main"
        "address_city": "Anytown",
        "address_postal_code": "12345",
        "address_country_code": "US"
    },
    "ship_to": {
        "name": "ACME Corp",
        "name_english": "ACME Corp",
        "address": "1234 Main St, Anytown, USA",
        "address_english": "1234 Main St, Anytown, USA",
        "address_reason": "value",
        "address_street": "1234 Main",
        "address_city": "Anytown",
        "address_postal_code": "12345",
        "address_country_code": "US"
    },
    "consignee": {
        "name": "ACME Corp",
        "name_english": "ACME Corp",
        "address": "1234 Main St, Anytown, USA",
        "address_english": "1234 Main St, Anytown, USA",
        "address_reason": "value",
        "address_street": "1234 Main",
        "address_city": "Anytown",
        "address_postal_code": "12345",
        "address_country_code": "US"
    }
}`;

        if (model === 'sf-ai') {
            const response = await openai.chat.completions.create({
                model: aiModel,
                messages: [
                    { role: "system", content: instructions },
                    { role: "user", content: prompt }
                ],
                response_format: { type: 'json_object' }
            });   
            // AI is bad at translating, so don't ask it to translate. If anything we can send to a translation service.
            // Also, it should test both. Keep the address in chinese and also translate it to english to see which one is a better match.
            const openAIPrice = priceCalculator.calculateTokenPrice(aiModel, response.usage);
            console.log("openAIPrice: ", openAIPrice);
            const aiResponse = response.choices[0].message.content.trim();
            return JSON.parse(aiResponse);
        } else {
            const completion = await openai.beta.chat.completions.parse({
                model: "gpt-4o",
                messages: [
                    { role: "system", content: instructions },
                    { role: "user", content: prompt },
                ],
                response_format: zodResponseFormat(FullResponseSchema, "response"),
            });
            
            // AI is bad at translating, so don't ask it to translate. If anything we can send to a translation service.
            // Also, it should test both. Keep the address in chinese and also translate it to english to see which one is a better match.
            const openAIPrice = priceCalculator.calculateTokenPrice(aiModel, completion.usage);
            console.log("openAIPrice: ", openAIPrice);
            const aiResponse = completion.choices[0].message.parsed;
            return aiResponse;
        }
    } catch (e) {
        console.log("Error getting AI response: ", e);
    }
}

/**
 * Perform final address check using OpenAI.
 * @param {Object} aiResponse - AI response object.
 * @returns {Object} Updated AI response object.
 */
async function finalAddressCheckOpenAI(model, apiVersion, aiResponse) {
    const addresses = {"sold_to": aiResponse.sold_to, "ship_to": aiResponse.ship_to, "consignee": aiResponse.consignee};
    console.log("final address check: ", JSON.stringify(addresses));

    // const newObj = Object.fromEntries(Object.entries(addresses).map(([k, v]) => [k, (({ name, translatedName, address, address_english, number, similarity }) => ({ name, translatedName, address, address_english, number, similarity }))(v)]));
    // const newObj = Object.fromEntries(Object.entries(addresses).map(([k, v]) => [k, (({ name, translatedName, address, translatedAddress, number, similarity }) => ({ name, translatedName, address, translatedAddress, number, similarity }))(v)]));
    
    
    const newObj = Object.fromEntries(
        Object.entries(addresses).map(([k, v]) => [
          k,
          {
            ...((({ name, translatedName, address, translatedAddress, number, similarity }) => 
              ({ name, translatedName, address, translatedAddress, number, similarity }))(v)),
            number: v.number ? Array.from(new Map(v.number.map(n => 
              [JSON.stringify(n), n])).values()) : []
          }
        ])
      );      
    console.log("newObj: ", JSON.stringify(newObj));
    // const 
    // return aiResponse;
//     const instructions = `## Address Check
// 1. If similarity is above 0.83, return the index of the number array. Stop evaluating for the number array of the object.
// 2. Compare the "address" or "address_english" fields to the "number.address" and "number.house" array.
// 3. Use **fuzzy matching** to allow for minor variations such as:
//    - Different spellings or transliterations (e.g., "chengke west road" vs. "chengkexi road").
//    - Formatting differences (e.g., spaces, punctuation, or ordering of unit/block).
//    - Case insensitivity.
// 4. If a **close match** is found based on the address (ignoring minor differences):
//    - Return the **index** of the matching element in the "number" array (0-based).
// 5. Check if the name or the translated name with the address stands out as a better match.
// 6. Define "close match" as a **similarity score** or **distance threshold**:
//    - Example: Use **Levenshtein distance** with a threshold of 10-15.
//    - Alternatively, a **similarity ratio** of at least 80%.
// 7. If there is **no close match** or the "number" array is null/empty:
//    - Return false.

// ## Response Format
// The output should use the following JSON structure:
// {
//     "sold_to": <index or false>,
//     "ship_to": <index or false>,
//     "consignee": <index or false>
// }`;

//     const instructions = `## Address Check

// 1. Check Similarity Scores First:
//    - Iterate through the "number" array for each address type (sold_to, ship_to, consignee).
//    - If any similarity in the "number" array is above 0.83:
//      - Immediately return the index of that entry.
//      - Stop evaluating further entries in the array for that address type and move to the next address type.
//    - If more than one entry has a similarity above 0.83, proceed to criteria evaluation.
//    - Do not reference similarity score if it's 0.

// 2. Criteria Evaluation for Multiple Matches:
//    - If multiple entries have a similarity above 0.83:
//      - Compare name or translatedName fields with the corresponding number.name.
//      - Use fuzzy matching to identify the best match.
//    - Compare address and address_english fields with number.address and number.house:
//      - Allow for variations such as different spellings, formatting differences, or case insensitivity.
//      - Use Levenshtein distance or a similarity ratio:
//        - Distance threshold: 10-15.
//        - Similarity ratio: At least 70%.

// 3. Fallback for No Match Above 0.83:
//    - If no entry in the "number" array has a similarity above 0.83:
//      - Evaluate based on fuzzy matching criteria as described in Step 2.
//    - If no close match is found, return false for that address type.

// 4. Include a reason for choice.

// 5. Required Response Format:
//    - The result for each address type should be either:
//      - The index of the best match in the "number" array (0-based).
//      - Or false if no suitable match is found.
//    - Required JSON response format:
//      {
//          "sold_to": <index or false>,
//          "sold_to_reason": <index or false>,
//          "ship_to": <index or false>,
//          "ship_to_reason": <index or false>,
//          "consignee": <index or false>,
//          "consignee_reason": <index or false>,
//      }
// `;

// const instructions = `## Address Check Instructions

// 1. **Check Similarity Scores First**
//    - For each address type (\`sold_to\`, \`ship_to\`, \`consignee\`):
//      1. **Filter by Similarity**:
//         - Gather all entries in the \`number\` array where \`similarity\` > 0.83.
//      2. **Select Entry**:
//         - **If only one entry** meets this criterion:
//           - **Select** its index.
//           - **Provide** the reason.
//         - **If multiple entries** meet this criterion:
//           1. **Identify Highest Similarity**:
//              - Determine the **maximum similarity score** among the filtered entries.
//           2. **Select First Occurrence of Highest Similarity**:
//              - **Find the first entry in the \`number\` array** that has this highest similarity score.
//              - **Do not sort or reorder entries.**  
//              - **The first occurrence (lowest index) in the original list must always be chosen.**
//           3. **Provide** the reason for the selection.
//      3. **No High Similarity Entries**:
//         - If **no** entries have \`similarity\` > 0.83:
//           - **Return** \`false\` for this address type.
//           - **Provide** the reason.

//    - **Note**: Ignore any entry with a \`similarity\` of 0.

// 2. Reason for Choice  
//    - Include a short explanation for which index was chosen or why none was selected.

// 3. Required Response Format  
//    - Each address type should return either the 0-based index or \`false\`.
//    - Example JSON:
//      {
//        "sold_to": <index or false>,
//        "sold_to_reason": "<reason>",
//        "ship_to": <index or false>,
//        "ship_to_reason": "<reason>",
//        "consignee": <index or false>,
//        "consignee_reason": "<reason>"
//      }
// `;

const instructions = `## Address Check

        1. Check Similarity Scores First:
           - Iterate through the "number" array for each address type (sold_to, ship_to, consignee).
           - If any similarity in the "number" array is above 830:
             - Immediately return the index of that entry.
             - Stop evaluating further entries in the array for that address type and move to the next address type.
           - If more than one entry has a similarity above 830, proceed to criteria evaluation.
           - Do not reference similarity score if it's 0.
        
        2. Criteria Evaluation for Multiple Matches:
           - If multiple entries have a similarity above 830:
             - Compare name or translatedName fields with the corresponding number.name.
             - Use fuzzy matching to identify the best match.
           - Compare address and address_english fields with number.address and number.house:
             - Allow for variations such as different spellings, formatting differences, or case insensitivity.
             - Use Levenshtein distance or a similarity ratio:
               - Distance threshold: 10-15.
               - Similarity ratio: At least 70%.
        
        3. Fallback for No Match Above 830:
           - If no entry in the "number" array has a similarity above 830:
             - Evaluate based on fuzzy matching criteria as described in Step 2.
           - If no close match is found, return false for that address type.
        
        4. Include a reason for choice.
        
        5. Required Response Format:
           - The result for each address type should be either:
             - The index of the best match in the "number" array (0-based).
             - Or false if no suitable match is found.
           - Required JSON response format:
             {
                 "sold_to": <index or false>,
                 "sold_to_reason": <index or false>,
                 "ship_to": <index or false>,
                 "ship_to_reason": <index or false>,
                 "consignee": <index or false>,
                 "consignee_reason": <index or false>,
             }
        `;

    const prompt = `${JSON.stringify(newObj)}`;
    
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
            if (Azure) {
                apiKey = process.env.AZURE_API_KEY2;
            } else {
                apiKey = process.env.OPENAI_API_KEY;
            }
        }

        const resource = 'bio-sf-ai';
        // const model = 'sf-ai';
        // const apiVersion = '2023-07-01-preview';
        // const model = 'gpt-4o';
        // const apiVersion = '2024-08-01-preview';
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

        const messages = [
            {"role": "system", "content": instructions},
            {"role": "user", "content": prompt}
        ];

        console.log(messages);

        const response = await openai.chat.completions.create({
            model: aiModel,
            messages: messages,
            response_format: { type: 'json_object' }
        });
        // AI is bad at translating, so don't ask it to translate. If anything we can send to a translation service.
        // Also, it should test both. Keep the address in chinese and also translate it to english to see which one is a better match.
        const selectedModel = (model === 'sf-ai') ? aiModel : model;
        const openAIPrice = priceCalculator.calculateTokenPrice(selectedModel, response.usage);
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
        } else {
            aiResponse.sold_to.number = aiResponse.sold_to.number[checkResponse.sold_to];
        }
        if (checkResponse.ship_to === false) {
            aiResponse.ship_to = {};
            console.log("ship_to removed");
        } else {
            aiResponse.ship_to.number = aiResponse.ship_to.number[checkResponse.ship_to];
        }
        if (checkResponse.consignee === false) {
            aiResponse.consignee = {};
            console.log("consignee removed");
        } else {
            aiResponse.consignee.number = aiResponse.consignee.number[checkResponse.consignee];
        }
        if (checkResponse.ship_to !== false && checkResponse.consignee === false) {
            aiResponse.consignee = aiResponse.ship_to;
            console.log("consignee updated to ship_to");
        }
        if (checkResponse.ship_to === false && checkResponse.consignee !== false) {
            aiResponse.ship_to = aiResponse.consignee;
            console.log("ship_to updated to consignee");
        }
        console.log("final address check response: ", JSON.stringify(aiResponse));
        return aiResponse;
    } catch (e) {
        console.log("error getting image response: ", e);
    }
}

/**
 * Get customer information based on various parameters.
 * @param {Object} initialize - Initialized Pinecone index.
 * @param {string} type - Type of customer (sold_to, ship_to, consignee).
 * @param {Object} aiResponse - AI response object.
 * @param {string} name - Customer name.
 * @param {string} address - Customer address.
 * @param {string} street - Customer street.
 * @param {string} city - Customer city.
 * @param {string} postalCode - Customer postal code.
 * @param {string} country - Customer country.
 * @param {Array} addressArray - Array of addresses.
 * @param {string|null} seriesFallback - Series fallback.
 * @param {string|null} sold_toAddress - Sold to address.
 * @param {string|null} otherAddress - Other address.
 * @returns {Array} Filtered and ordered results.
 */
async function getCustomer(initialize, type, aiResponse, name, translatedName, address, street, city, postalCode, country, addressArray, seriesFallback = null, sold_toAddress = null, otherAddress = null) {
    console.log("name", name);
    console.log("translated name: ", translatedName);
    console.log("address", address);
    console.log("city", city);
    console.log("postalCode", postalCode);
    console.log("country", country);

    if (!address) return "";
    
    const parsedAddress = await getParsedAddress(address);

    console.log(parsedAddress);

    let addressEmbedding, streetEmbedding;
    
    addressEmbedding = await createEmbedding(parsedAddress.data);
    console.log("address for embedding: ", parsedAddress.data);

    if (street) {
        streetEmbedding = await createEmbedding(street);
        console.log("street for embedding: ", street);
    }

    const parsedStreet = parsedAddress.parsed
        .filter(entry => ['unit', 'house', 'house_number', 'road'].includes(entry.label))
        .map(entry => entry.value)
        .join(', ');
        
    console.log("parsed street: ", parsedStreet);

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
    let addressSearchResults = [];

    console.log("seriesFallback: ", seriesFallback);

    if (addressEmbedding) {
        // addressSearchResults = await searchAddress(initialize, parsedAddress, street, city, postalCode, country, addressEmbedding, 'addresses', series);
        addressSearchResults = await searchAddress(initialize, type, name, translatedName, parsedAddress, street, parsedStreet, city, postalCode, country, addressEmbedding, streetEmbedding, vectorNamespace, requiredSeries);
        // deduplicate results
        // addressSearchResults = addressSearchResults.filter((v,i,a)=>a.findIndex(t=>(t.metadata.customer === v.metadata.customer))===i);
        console.log("address results: ", JSON.stringify(addressSearchResults))
    }
    
    if (!addressSearchResults || addressSearchResults.length === 0) return [];

    // Filter out 'bio-rad' results
    let filteredResults = addressSearchResults.filter(
        (result) =>
            result?.metadata?.name1?.trim() &&
            !result.metadata.name1.toLowerCase().includes("bio-rad")
    );

    // Not sorting by score for now; using similarity which includes name for now
    // Only sort by score if similarity is not present
    if (!filteredResults?.[0]?.similarity) {
        // Sort filtered results by score in descending order
        filteredResults.sort((a, b) => b.score - a.score);
    }

    console.log("Filtered Results (no bio-rad):", filteredResults);

    /* Similarity Check */
        // Threshold for similarity
        const threshold = 0.8;

        // Compare query name with each metadata.name1
        
        // const resultsWithSimilarity = filteredResults.map(result => {
        //     const similarity = natural.JaroWinklerDistance(
        //         translatedName.toLowerCase(),
        //         result.metadata.name1.toLowerCase()
        //     );
        //     return { ...result, similarity };
        // });

        const resultsWithSimilarity = filteredResults.map(result => {
            const nameSimilarity = name ? natural.JaroWinklerDistance(
                name.toLowerCase(),
                result.metadata.name1.toLowerCase()
            ) : 0;

            const translatedNameSimilarity = translatedName ? natural.JaroWinklerDistance(
                translatedName.toLowerCase(),
                result.metadata.name1.toLowerCase()
            ) : 0;

            const maxSimilarity = Math.max(nameSimilarity, translatedNameSimilarity);
            // return { ...result, similarity: maxSimilarity };
            return { ...result, similarity: parseFloat(maxSimilarity.toFixed(3)) * 1000 };
        });

        // Check if any result meets the threshold
        const matchesAboveThreshold = resultsWithSimilarity.filter(result => result.similarity >= threshold);

        if (matchesAboveThreshold.length > 0) {
            // Update filteredResults only if there are matches above the threshold
            filteredResults = matchesAboveThreshold.sort((a, b) => b.similarity - a.similarity);
        }

        console.log(`Closest matches to ${translatedName}:`, filteredResults);

        // Add unique names to nameArray
        filteredResults.forEach((match) => {
            if (
                match?.metadata?.name1?.trim() &&
                !nameArray.includes(match.metadata.name1)
            ) {
                nameArray.push(match.metadata.name1);
            }
        });

        console.log("Updated nameArray: ", nameArray);

        console.log(filteredResults);
    /* Similarity Check */

    // Return all filtered and ordered results
    return filteredResults.map((result) => ({
        name: result.metadata.name1,
        customer: result.metadata.customer,
        address: result.metadata.oneLineAddress,
        house: result.metadata.houseNumber,
        similarity: (result.similarity) || 0,
    }));
}


/**
 * Main function to process the event.
 * @param {Object} event - Event object.
 * @param {Function} callback - Callback function.
 * @returns {Object} Response object.
 */
export async function customerTest(filePath, model, apiVersion, event, callback) {
    const initialize = await initializePinecone(pinecone_api_key, vectorIndexName);
    let PDF;
    if (!AWS) {
        // const filePath = './qa_testing/VT040.pdf';
        PDF = await fs.promises.readFile(filePath, {encoding: 'base64'});
    }

    if (!PDF) {
        console.log("No PDF received.");
        // return {
        //     statusCode: 200,
        //     body: JSON.stringify("No PDF received."),
        // };
    }

    // let resultLayout = await azureProcessing(PDF, "prebuilt-layout");
    // console.log('full resultInvoice:', JSON.stringify(resultLayout));

    let resultInvoice, invoiceResultDocuments, invoice;
    const simpleAddressContent = `
    **Paragraphs**:
["BECKMAN COULTER","VENDOR :","美商伯瑞股份有限公司","Bio-Rad Laboratories Inc. Taiwan Branch","3F, NO 126, SEC 4, NANJING E RD","TAIPEI,","105","Taiwan","SHIP TO :","美商貝克曼庫爾特有限公司台灣分公司","新北市汐止區工建路358號6樓","台北市,106","Taiwan","BILL TO :","美商貝克曼庫爾特有限公司台灣分公司","大安區敦化南路2段216號8樓","台北市,106","Taiwan","Standard Purchase Order","PURCHASE ORDER NUMBER","REVISION","PAGE","79008772","0","1 of 3","VENDOR NO : 42782","ORDER DATE/BUYER/TELEPHONE","REVISED DATE/BUYER/TELEPHONE /HSU, HAN YING (JESSY)/","CONFIRM TO/TELEPHONE/EMAIL /() /","REQUESTOR/DELIVER TO HSU, HAN YING (JESSY)","19-SEP-24/HSU, HAN YING (JESSY)/","PAYMENT TERMS","FREIGHT TERMS","SHIP VIA","CURRENCY","LAST APPROVER","DUE 25TH OF NEXT THREE MONTH","TWD","KODA, MAKOTO","LINE#","PART NUMBER/DESCRIPTION","REV","DELIVER DATE","VENDOR ITEM","QUANTITY","UOM","UNIT PRICE","TOTAL PRICE","COMMENT","1","A39038 360 Liquichek Immunoassay Plus Control, Trilevel Supplier must provide Certificate of Analysis or other Certificate certifying date of manufacture with every shipment or every lot. Such documents must be included in the goods upon receipt at Buyer's delivery address or sent to the buyer in advance with matching part purchase order and shipment dates.","0","24-SEP-24","30EA","5000","150,000.00","SHIP TO","2","汐止區工建路358號6樓 新北市,221 Taiwan C39262 697 Liquid Unassayed Multiqual, Level 1, 12 x10 mL","0","24-SEP-24","1EA","5800","5,800.00","SHIP TO","3","汐止區工建路358號6樓 新北市,221 Taiwan C39264 699 Liquid Unassayed Multiqual, Level 3, 12 ×10 mL","0","24-SEP-24","1EA","5800","5,800.00","SHIP TO","4","汐止區工建路358號6樓 新北市,221 Taiwan C37288 593 Liquichek Immunology Control, Level 3, 6x1 mL","0","24-SEP-24","2EA","3280","6,560.00","BECKMAN COULTER","SHIP TO :","美商貝克曼庫爾特有限公司台灣分公司","新北市汐止區工建路358號6樓","台北市,106","Taiwan","BILL TO :","美商貝克曼庫爾特有限公司台灣分公司","大安區敦化南路2段216號8樓","台北市,106","Taiwan","Standard Purchase Order","PURCHASE ORDER NUMBER","REVISION","PAGE","79008772","0","2 of 3","VENDOR :","美商伯瑞股份有限公司","Bio-Rad Laboratories Inc. Taiwan Branch","3F, NO 126, SEC 4, NANJING E RD","TAIPEI,","105","Taiwan","VENDOR NO : 42782","ORDER DATE/BUYER/TELEPHONE","REVISED DATE/BUYER/TELEPHONE /HSU, HAN YING (JESSY)/","CONFIRM TO/TELEPHONE/EMAIL","REQUESTOR/DELIVER TO","19-SEP-24/HSU, HAN YING (JESSY)/","/() /","HSU, HAN YING (JESSY)","PAYMENT TERMS","FREIGHT TERMS","SHIP VIA CURRENCY","LAST APPROVER","DUE 25TH OF NEXT THREE MONTH","TWD","KODA, MAKOTO","LINE#","PART NUMBER/DESCRIPTION","REV","DELIVER DATE","VENDOR ITEM","QUANTITY","UOM","UNIT PRICE","TOTAL PRICE","COMMENT","SHIP TO","汐止區工建路358號6樓","新北市,221 Taiwan","5","C37287","0","24-SEP-24","2EA","3280","6,560.00","592 Liquichek Immunology Control, Level 2, 6x1 mL","SHIP TO","汐止區工建路358號6樓","新北市,221 Taiwan","6","C37286","0","24-SEP-24","2EA","3280","6,560.00","591 Liquichek Immunology Control, Level 1, 6x1 mL","SHIP TO","7","汐止區工建路358號6樓 新北市,221 Taiwan C39802","0","24-SEP-24","2EA","14500","29,000.00","423 Liquichek Urine Toxicology Control Level S1E Low Opiate, 10x10 mL","SHIP TO","Address at top of page","TOTAL AMOUNT 210,280.00"]

**Tables**:
["Table 1:\nPURCHASE ORDER NUMBER,REVISION,PAGE\n79008772,0,1 of 3\n","Table 2:\n19-SEP-24/HSU, HAN YING (JESSY)/,REVISED DATE/BUYER/TELEPHONE /HSU, HAN YING (JESSY)/,,CONFIRM TO/TELEPHONE/EMAIL /() /,REQUESTOR/DELIVER TO HSU, HAN YING (JESSY)\nPAYMENT TERMS,FREIGHT TERMS,SHIP VIA,CURRENCY,LAST APPROVER\nDUE 25TH OF NEXT THREE MONTH,,,TWD,KODA, MAKOTO\n","Table 3:\nLINE#,PART NUMBER/DESCRIPTION,REV,DELIVER DATE,VENDOR ITEM,QUANTITY,UOM,UNIT PRICE,TOTAL PRICE,COMMENT\n1,A39038 360 Liquichek Immunoassay Plus Control, Trilevel Supplier must provide Certificate of Analysis or other Certificate certifying date of manufacture with every shipment or every lot. Such documents must be included in the goods upon receipt at Buyer's delivery address or sent to the buyer in advance with matching part purchase order and shipment dates.,0,24-SEP-24,,,30EA,5000,150,000.00,\n,SHIP TO,,,,,,,,\n2,汐止區工建路358號6樓 新北市,221 Taiwan C39262 697 Liquid Unassayed Multiqual, Level 1, 12 x10 mL,0,24-SEP-24,,,1EA,5800,5,800.00,\n,SHIP TO,,,,,,,,\n3,汐止區工建路358號6樓 新北市,221 Taiwan C39264 699 Liquid Unassayed Multiqual, Level 3, 12 ×10 mL,0,24-SEP-24,,,1EA,5800,5,800.00,\n,SHIP TO,,,,,,,,\n4,汐止區工建路358號6樓 新北市,221 Taiwan C37288 593 Liquichek Immunology Control, Level 3, 6x1 mL,0,24-SEP-24,,,2EA,3280,6,560.00,\n","Table 4:\nPURCHASE ORDER NUMBER,REVISION,PAGE\n79008772,0,2 of 3\n","Table 5:\nORDER DATE/BUYER/TELEPHONE,REVISED DATE/BUYER/TELEPHONE /HSU, HAN YING (JESSY)/,CONFIRM TO/TELEPHONE/EMAIL,REQUESTOR/DELIVER TO\n19-SEP-24/HSU, HAN YING (JESSY)/,,/() /,HSU, HAN YING (JESSY)\n","Table 6:\nPAYMENT TERMS,FREIGHT TERMS,SHIP VIA CURRENCY,LAST APPROVER\nDUE 25TH OF NEXT THREE MONTH,,TWD,KODA, MAKOTO\n","Table 7:\nLINE#,PART NUMBER/DESCRIPTION,REV,DELIVER DATE,VENDOR ITEM,QUANTITY,UOM,UNIT PRICE,TOTAL PRICE,COMMENT\n,SHIP TO,,,,,,,,\n,汐止區工建路358號6樓,,,,,,,,\n,新北市,221 Taiwan,,,,,,,,\n5,C37287,0,24-SEP-24,,,2EA,3280,6,560.00,\n,592 Liquichek Immunology Control, Level 2, 6x1 mL,,,,,,,,\n,SHIP TO,,,,,,,,\n,汐止區工建路358號6樓,,,,,,,,\n,新北市,221 Taiwan,,,,,,,,\n6,C37286,0,24-SEP-24,,,2EA,3280,6,560.00,\n,591 Liquichek Immunology Control, Level 1, 6x1 mL,,,,,,,,\n,SHIP TO,,,,,,,,\n7,汐止區工建路358號6樓 新北市,221 Taiwan C39802,0,24-SEP-24,,,2EA,14500,29,000.00,\n,423 Liquichek Urine Toxicology Control Level S1E Low Opiate, 10x10 mL,,,,,,,,\n,SHIP TO,,,,,,,,\n,Address at top of page,,,,,,,,\n"]

Item Content: [{"index":0,"content":["150,000.00","24-SEP-24","A39038\n360 Liquichek Immunoassay Plus Control, Trilevel\nSupplier must provide Certificate of Analysis or other\nCertificate certifying date of manufacture with every\nshipment or every lot. Such documents must be\nincluded in the goods upon receipt at Buyer's delivery\naddress or sent to the buyer in advance with\nmatching part purchase order and shipment dates.","30EA","5000"]},{"index":1,"content":["5,800.00","24-SEP-24","C39262\n697 Liquid Unassayed Multiqual, Level 1, 12 x10 mL","1EA","5800"]},{"index":2,"content":["5,800.00","24-SEP-24","C39264\n699 Liquid Unassayed Multiqual, Level 3, 12 x10 mL","1EA","5800"]},{"index":3,"content":["6,560.00","24-SEP-24","C37288\n593 Liquichek Immunology Control, Level 3, 6x1 mL","2EA","3280"]},{"index":4,"content":["6,560.00","24-SEP-24","C37287\n592 Liquichek Immunology Control, Level 2, 6x1 mL","2EA","3280"]},{"index":5,"content":["6,560.00","24-SEP-24","C37286\n591 Liquichek Immunology Control, Level 1, 6x1 mL","2EA","3280"]},{"index":6,"content":["29,000.00","24-SEP-24","C39802\n423 Liquichek Urine Toxicology Control Level S1E Low\nOpiate, 10x10 mL","2EA","14500"]}]
`;
    // resultInvoice = await azureProcessing(PDF, "prebuilt-invoice");
    // console.log('full invoice:', JSON.stringify(resultInvoice));

    // invoiceResultDocuments = resultInvoice.documents[0];
    // invoice = invoiceResultDocuments.fields;

    // const simpleAddressContent = {
    //     CustomerAddress: invoice.CustomerAddress
    //         ? {
    //             type: "address",
    //             content: invoice.CustomerAddress.content || "",
    //             valueAddress: {
    //                 houseNumber: invoice.CustomerAddress.valueAddress?.houseNumber || "",
    //                 road: invoice.CustomerAddress.valueAddress?.road || "",
    //                 city: invoice.CustomerAddress.valueAddress?.city || "",
    //                 streetAddress: invoice.CustomerAddress.valueAddress?.streetAddress || "",
    //                 unit: invoice.CustomerAddress.valueAddress?.unit || "",
    //                 level: invoice.CustomerAddress.valueAddress?.level || ""
    //             }
    //         }
    //         : {},
    //     CustomerAddressRecipient: invoice.CustomerAddressRecipient
    //         ? {
    //             type: "string",
    //             valueString: invoice.CustomerAddressRecipient.valueString || "",
    //             content: invoice.CustomerAddressRecipient.valueString || ""
    //         }
    //         : {},
    //     CustomerName: invoice.CustomerName
    //         ? {
    //             type: "string",
    //             valueString: invoice.CustomerName.valueString || "",
    //             content: invoice.CustomerName.valueString || ""
    //         }
    //         : {},
    //     VendorAddress: invoice.VendorAddress
    //         ? {
    //             type: "address",
    //             content: invoice.VendorAddress.content || "",
    //             valueAddress: {
    //                 houseNumber: invoice.VendorAddress.valueAddress?.houseNumber || "",
    //                 road: invoice.VendorAddress.valueAddress?.road || "",
    //                 postalCode: invoice.VendorAddress.valueAddress?.postalCode || "",
    //                 city: invoice.VendorAddress.valueAddress?.city || "",
    //                 countryRegion: invoice.VendorAddress.valueAddress?.countryRegion || "",
    //                 streetAddress: invoice.VendorAddress.valueAddress?.streetAddress || "",
    //                 cityDistrict: invoice.VendorAddress.valueAddress?.cityDistrict || ""
    //             }
    //         }
    //         : {},
    //     VendorAddressRecipient: invoice.VendorAddressRecipient
    //         ? {
    //             type: "string",
    //             valueString: invoice.VendorAddressRecipient.valueString || "",
    //             content: invoice.VendorAddressRecipient.valueString || ""
    //         }
    //         : {},
    //     VendorName: invoice.VendorName
    //         ? {
    //             type: "string",
    //             valueString: invoice.VendorName.valueString || "",
    //             content: invoice.VendorName.valueString || ""
    //         }
    //         : {}
    // };

    // console.log(JSON.stringify(simpleAddressContent, null, 2));

    // const model = 'sf-ai';
    // const apiVersion = '2023-07-01-preview';
    // const model = 'gpt-4o';
    // const apiVersion = '2024-08-01-preview';

    let aiResponse = await fetchCustomerFromOpenAI('sf-ai', '2023-07-01-preview', JSON.stringify(simpleAddressContent));
    console.log("Simple Address Response: ", JSON.stringify(aiResponse));

    const target = "en-US";
    // Helper function to set translated name
    async function setTranslatedName(entity, fallbackName) {
        if (!entity.name) {
            entity.name = fallbackName.name || ""; // Assign fallbackName.name or an empty string if neither exists
            entity.translatedName = fallbackName.translatedName || entity.name; // Use fallback translatedName or entity.name
        } else {
            if (!entity.name_english) {
                const translated = await translateText({ text: entity.name }, target);
                entity.translatedName = translated?.translations[0]?.translatedText ?? entity.name;
            } else {
                entity.translatedName = entity.name_english;
            }
        }
        if (!entity.address) {
            entity.name = fallbackName.address || ""; // Assign fallbackName.name or an empty string if neither exists
            entity.translatedAddress = fallbackName.translatedAddress || entity.address; // Use fallback translatedName or entity.name
        } else {
            const translated = await translateText({ text: entity.address }, target);
            entity.translatedAddress = translated?.translations[0]?.translatedText ?? entity.address;
        }
    } 

    const addressArray = aiResponse.address_array || [];

    // Helper function to set address customer
    async function setAddressCustomer(entityType, entity) {
        return entity
            ? await getCustomer(
                initialize,
                entityType,
                aiResponse,
                entity.name,
                entity.translatedName,
                entity.address,
                entity.address_street,
                entity.address_city,
                entity.address_postal_code,
                entity.address_country_code,
                addressArray
            )
            : null;
    }

    aiResponse.sold_to = aiResponse.supplier || {};

    // Set sold_to details
    await setTranslatedName(aiResponse.sold_to, aiResponse.ship_to);
    aiResponse.sold_to_address_customer = await setAddressCustomer("sold_to", aiResponse.sold_to);

    // Set ship_to details
    await setTranslatedName(aiResponse.ship_to, aiResponse.sold_to);
    aiResponse.ship_to_address_customer = await setAddressCustomer("ship_to", aiResponse.ship_to);

    // Set consignee details
    await setTranslatedName(aiResponse.consignee, aiResponse.ship_to);
    aiResponse.consignee_address_customer = await setAddressCustomer("consignee", aiResponse.consignee);

    console.log(aiResponse);

    // append the number to customer number to each
    aiResponse.sold_to.number = aiResponse.sold_to_address_customer;
    aiResponse.ship_to.number = aiResponse.ship_to_address_customer;
    aiResponse.consignee.number = aiResponse.consignee_address_customer;

    aiResponse = await finalAddressCheckOpenAI(model, apiVersion, aiResponse);
    // after final check, assign the customer number to the address
    aiResponse.sold_to_address_customer = aiResponse.sold_to?.number?.customer;
    aiResponse.ship_to_address_customer = aiResponse.ship_to?.number?.customer;
    aiResponse.consignee_address_customer = aiResponse.consignee?.number?.customer;

    // Check if sold_to is empty and ship_to starts with "1"
    if (!aiResponse.sold_to_address_customer && aiResponse.ship_to_address_customer?.toString().startsWith("1")) {
        console.log("sold_to is empty, using ship_to as sold_to...");
        console.log("removing sold_to:", aiResponse.sold_to);
        aiResponse.sold_to = { ...aiResponse.ship_to };
        aiResponse.sold_to_address_customer = aiResponse.ship_to_address_customer;
    }
    
    console.log("Final Response: ", JSON.stringify(aiResponse));

    const filename = path.basename(filePath, path.extname(filePath));
    const outputPath = `./test/${filename}.json`;

    try {
        await fs.promises.writeFile(outputPath, JSON.stringify(aiResponse, null, 2));
        console.log(`Response saved to ${outputPath}`);
    } catch (error) {
        console.error(`Error saving response to ${outputPath}:`, error);
    }
}

// await customerTest();