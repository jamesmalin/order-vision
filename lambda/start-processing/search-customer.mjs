// search.mjs
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from 'dotenv';
import OpenAI from 'openai';
import axios from "axios";

dotenv.config();

// const pinecone_api_key = process.env.PINECONE_API_KEY;
// // note: in testing the small embedding performs better than the large embedding for full addresses
// const vectorIndexName = 'addresses';
// const namespace = 'address_v4_prod_adrc'; 
// const resource = 'bio-sf-ai';

const pinecone_api_key = process.env[`PINECONE_PROD_API_KEY`];
const vectorIndexName = 'addresses'; // addresses, addresses-large
const namespace = process.env.NAMESPACE || "address_v1_E2D";
const resource = 'bio-sf-ai';

const model = 'text-embedding-3-small'; // text-embedding-3-small, text-embedding-3-large
const apiVersion = '2023-07-01-preview';
const openaiApiKey = process.env.AZURE_API_KEY2;

// Initialize OpenAI client for embedding generation
const openai = new OpenAI({
    apiKey: openaiApiKey,
    baseURL: `https://${resource}.openai.azure.com/openai/deployments/${model}`,
    defaultQuery: { 'api-version': apiVersion },
    defaultHeaders: { 'api-key': openaiApiKey },
});

// Function to create embedding
async function createEmbedding(input) {
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
async function searchPinecone(index, customer, international, namespace = '') {
    const embedding = new Array(1536).fill(0);
    try {
        const ns = index.namespace(namespace);
        const response = await ns.query({
            topK: 1,
            vector: embedding,
            filter: {
                "customer": {"$eq": customer},
                "international": {"$eq": international}
            },
            includeMetadata: true,
            includeValues: false
        });
        return response.matches;
    } catch (error) {
        console.error("Error searching in Pinecone:", error);
    }
}

// Main function to run search
export async function searchCustomer(index, customer, international = false) {
    // Specify what to search on
    console.log(`Searching for: "${customer}"`);

    // Perform search
    const results = await searchPinecone(index, customer, international, namespace);

    // // Display search results
    // console.log("Search Results:");
    // results.forEach((result, i) => {
    //     console.log(`Result ${i + 1}:`, result.metadata, "Score:", result.score);
    // });

    return results;
}

// const customer = 10000000;
// const results = await searchCustomer(customer);
// console.log(results);