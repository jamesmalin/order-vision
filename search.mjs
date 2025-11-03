// search.mjs
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from 'dotenv';
import OpenAI from 'openai';
import axios from "axios";
import natural from 'natural';
import { searchCustomer } from "./search-customer.mjs";

dotenv.config();

const pinecone_api_key = process.env.PINECONE_API_KEY;
// note: in testing the small embedding performs better than the large embedding for full addresses
const vectorIndexName = 'addresses'; // addresses, addresses-large
const namespace = 'address_v8_prod_adrc'; // address_v1_E2D, address_v7_prod_adrc, address_v5_prod_adrc, address_v4_prod_adrc, address_default, addresses, name, name_address, address_v2, address_v3_adrc, address_v3_qa_adrc, address_v4_qa_adrc, address_v4_prod_adrc
const resource = 'bio-sf-ai';
const model = 'text-embedding-3-small'; // text-embedding-3-small, text-embedding-3-large
const apiVersion = '2023-07-01-preview';
// const openaiApiKey = process.env.AZURE_API_KEY2;

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

// Function to search in Pinecone
async function searchPinecone(index, embedding, namespace = '', filter = {}) {
    try {
        const ns = index.namespace(namespace);
        const response = await ns.query({
            topK: 3,
            vector: embedding,
            includeMetadata: true,
            includeValues: false,
            filter: filter
        });
        return response.matches;
    } catch (error) {
        console.error("Error searching in Pinecone:", error);
    }
}

async function getParsedAddress(oneLineAddress) {
    try {
        const dockerUsed = 'rest';
        const single = true;
        const request = (dockerUsed === 'rest') ? {
            query: oneLineAddress
        } : {
            address: oneLineAddress,
            title_case: true
        };

        const response = await axios.post('http://34.219.176.221/expandparser', request, {
            headers: {
                'accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        if (single && dockerUsed === 'rest') {
            const parsedAddress = (dockerUsed === 'rest')
                ? response.data.find(entry => entry.type === 'expansion')
                : response.data;

            return parsedAddress.data;
        } else {
            return response.data;
        }
    } catch (error) {
        console.error("Error parsing address:", error);
        return null;
    }
}

// Exported function to search address
export async function addressSearch(index, openai, address, name, translatedName, filter) {
    console.log(`Searching for: "${address}"`);
    console.log(name, translatedName);

    const parsedAddress = await getParsedAddress(address);
    console.log("parsedAddress:", parsedAddress);

    const embedding = await createEmbedding(openai, address.toLowerCase());

    // console.log("embedding: ", embedding);
    // console.log("filter: ", filter);
    // console.log("index: ", index);
    // console.log("namespace: ", namespace);
    // console.log(address.toLowerCase());

    console.log("searching pinecone...", namespace, filter);

    let results = await searchPinecone(index, embedding, namespace, filter);

    // console.log("results: ", JSON.stringify(results));

    if (typeof(name) !== 'undefined' || typeof(translatedName) !== 'undefined') {
        const threshold = 0.85;

        const resultsWithSimilarity = results.map(result => {
            const nameSimilarity = name ? natural.JaroWinklerDistance(
                name.toLowerCase(),
                result.metadata.name1.toLowerCase()
            ) : 0;

            const translatedNameSimilarity = translatedName ? natural.JaroWinklerDistance(
                translatedName.toLowerCase(),
                result.metadata.name1.toLowerCase()
            ) : 0;

            let maxSimilarity = Math.max(nameSimilarity, translatedNameSimilarity);

            // return { ...result, similarity: maxSimilarity };
            return { ...result, similarity: parseFloat(maxSimilarity.toFixed(3)) };
        });

        console.log("before filtering similarity results: ", resultsWithSimilarity);

        const filteredResults = resultsWithSimilarity.filter(result => result.similarity >= threshold);

        // get unique results based on metadata.customer
        const uniqueResults = Array.from(new Set(filteredResults.map(a => a.metadata.customer)))
            .map(customer => {
                return filteredResults.find(a => a.metadata.customer === customer);
            });
        
        console.log("after filtering similarity results: ", uniqueResults);

        if (uniqueResults.length > 0) {
            for (const result of uniqueResults) {
                if (result.similarity > 0.75) {
                    const customerResult = await searchCustomer(index, result.metadata.customer, true);
                    console.log(customerResult);
                    // if a result is found, copy the entire result and add .10 to the similarity score; add this to filteredResults
                    if (customerResult.length > 0) {
                        customerResult[0].similarity = parseFloat((result.similarity + 0.100).toFixed(3));
                        filteredResults.push(customerResult[0]);
                    }
                }
            }
        }

        if (filteredResults.length > 0) {
            results = filteredResults.sort((a, b) => b.similarity - a.similarity);
        }
    }

    return results;
}
