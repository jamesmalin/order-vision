import { Pinecone } from "@pinecone-database/pinecone";
import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

import { addressSearch } from "./search.mjs";

import PriceCalculator from 'ai-calc';
import { match } from "assert";
const priceCalculator = new PriceCalculator();
const aiModel = "gpt-4-1106-preview"; // gpt-4-1106-preview, gpt-4o, o1-mini

const AWS = process.env.AWS === 'true';
const Azure = process.env.AZURE === 'true';

// const pinecone_api_key = process.env.PINECONE_API_KEY;
const pinecone_api_key = process.env[`PINECONE_PROD_API_KEY`];
const vectorIndexName = 'addresses';
const vectorNamespace = process.env.NAMESPACE || "address_v8_prod_adrc"; // address_default, addresses, name, name_address, address_v2, address_v3_adrc, address_v3_qa_adrc, address_v4_qa_adrc

const apiKey = process.env.AZURE_API_KEY2;
const embeddingResource = 'bio-sf-ai';
const embeddingAPIVersion = '2023-07-01-preview';
const embeddingModel = 'text-embedding-3-small';
const embeddingOpenAI = new OpenAI({
    apiKey: apiKey,
    baseURL: `https://${embeddingResource}.openai.azure.com/openai/deployments/${embeddingModel}`,
    defaultQuery: { 'api-version': embeddingAPIVersion },
    defaultHeaders: { 'api-key': apiKey },
});

async function initializePinecone(pineconeApiKey, indexName) {
    const pinecone = new Pinecone({
        apiKey: pineconeApiKey
    });
    const index = pinecone.index(indexName);
    console.log("Pinecone client and index initialized");
    return index;
}

const initialize = await initializePinecone(pinecone_api_key, vectorIndexName);

const address = `private bag 9014 hastings 4156 new zealand`;
const name = "hawkes bay district";
const translatedName = "hawkes bay district";
const filter = {
    // country: { '$eq': 'br' },
    country: { '$in': ['NZ', 'nz'] },
    customer: { '$gte': 1000000, '$lt': 2000000 },
};

const result = await addressSearch(initialize, embeddingOpenAI, address, name, translatedName, filter);
console.log(result);