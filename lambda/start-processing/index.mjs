import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
// import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import DocumentIntelligence, { getLongRunningPoller, isUnexpected } from "@azure-rest/ai-document-intelligence";
import { trackProcessingCompleted, trackProcessingFailed, trackSAPDeliveryCompleted, trackSAPDeliveryFailed } from './tracking-utils.mjs';
import fs from "fs";
import OpenAI from 'openai';
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { Pinecone } from "@pinecone-database/pinecone";
import axios, { all } from 'axios';
import http from 'http';
import dotenv from 'dotenv';
dotenv.config();

// import { invokeAuth } from "./invoke-auth.mjs";

import { callAnthropic } from "./anthropic.mjs";
import { formatDates } from "./format-dates.mjs";
import { translateText } from "./translate.mjs";
import { searchMaterial } from "./search-material.mjs";
import { extractMaterials } from './extract-materials.mjs';
import { searchAccountManager } from "./search-accountmanager.mjs";
import { addressSearch } from "./search.mjs";
import { searchCustomer } from "./search-customer.mjs";
import { checkKNVP } from "./knvp-check.mjs";
import { findQuoteNumber } from "./quote-number.mjs";
import { findRRC } from "./rrc-number.mjs";
import natural from 'natural';

import states from "./states.json" with { type: "json" };

const stateAbbreviations = states.map(state => state.Abbreviation.toLocaleLowerCase());
const stateNames = states.map(state => state.State.toLowerCase());

import PriceCalculator from 'ai-calc';
import { match } from "assert";
const priceCalculator = new PriceCalculator();
const aiModel = "gpt-4-1106-preview"; // gpt-4-1106-preview, gpt-4o, o1-mini

const AWS = process.env.AWS === 'true';
const BUCKET_NAME = process.env.BUCKET_NAME || 'order-vision-ai-dev';
const REGION = process.env.AWS_LAMBDA_REGION || 'us-east-2';
const s3Client = new S3Client({ region: REGION });
const lambdaClient = new LambdaClient({ region: REGION });
const Azure = process.env.AZURE === 'true';

// Function to send alert to CloudWatch alerts Lambda using direct Lambda invocation
async function sendAlert(alertData) {
  const environment = process.env.ENVIRONMENT || 'Development';
  
  const payload = {
    lambda: 'Order Vision Start Processing',
    environment: environment,
    alertType: 'manual',
    alarmName: 'Processing Error',
    severity: 'High',
    message: alertData.message,
    timestamp: new Date().toISOString()
  };

  try {
    const command = new InvokeCommand({
      FunctionName: 'cloudwatch-alerts',
      InvocationType: 'Event', // Asynchronous invocation
      Payload: JSON.stringify(payload)
    });

    await lambdaClient.send(command);
    console.log('Alert sent successfully to cloudwatch-alerts lambda');
  } catch (error) {
    console.error('Error sending alert to cloudwatch-alerts lambda:', error);
    // Don't fail the main function if alert fails
  }
}

const pinecone_env = process.env.PINECONE_ENVIRONMENT || 'DEV';
// const pinecone_api_key = process.env[`PINECONE_${pinecone_env}_API_KEY`];
const pinecone_api_key = process.env[`PINECONE_PROD_API_KEY`];
// const pinecone_api_key = process.env[`PINECONE_QA_API_KEY`];

const vectorIndexName = 'addresses';
const vectorNamespace = process.env.NAMESPACE || "address_v7_prod_adrc"; // address_v1_E2D, address_v4_prod_adrc, address_default, addresses, name, name_address, address_v2, address_v3_adrc, address_v3_qa_adrc, address_v4_qa_adrc

// address_v4_prod_adrc -- CHINA LIVE; REST OF WORLD LIVE
// address_v8_prod_adrc -- NEW; NEED TO COMBINE THESE TWO

// it copied the address_v4_prod_adrc to address_v8_prod_adrc

// const endpoint = process.env.AZURE_INVOICE_PARSER_ENDPOINT;
// key = process.env.AZURE_INVOICE_PARSER_KEY;

const parserEndpoint = process.env[`AZURE_INVOICE_PARSER_ENDPOINT_${pinecone_env}`];
const parserKey = process.env[`AZURE_INVOICE_PARSER_KEY_${pinecone_env}`];

// Will be initialized in main() after getting the API key
let embeddingOpenAI;

// Configuration for primary client
const primaryEmbeddingConfig = {
    resource: 'order-vision-ai',
    apiVersion: '2024-12-01-preview',
    model: 'text-embedding-3-small'
};

// Configuration for fallback client
const fallbackEmbeddingConfig = {
    resource: 'bio-sf-ai', // Different resource
    apiVersion: '2023-07-01-preview', // Different API version
    model: 'text-embedding-3-small'
};

// Race condition winner - will be set by the first successful embedding call
let winningEmbeddingOpenAI = null;
let winningEmbeddingConfig = null;

// These will be set to the winning configuration after the race
let embeddingResource;
let embeddingAPIVersion;
let embeddingModel;

/**
 * Fetch data from OpenAI based on the given prompt.
 * @param {string} prompt - Prompt to send to OpenAI.
 * @returns {Object} AI response object.
 */
// Get OpenAI API key once at the start
async function getOpenAIKey() {
    if (AWS) {
        const secretsManagerClient = new SecretsManagerClient();
        const input = {
            SecretId: (Azure) ? "AzureOrderVisionOpenAIKey" : "OpenAIKey"
        };
        const command = new GetSecretValueCommand(input);
        const secretsResponse = await secretsManagerClient.send(command);
        const secret = JSON.parse(secretsResponse.SecretString);
        return (Azure) ? secret.AzureOpenAIKey : secret.key;
    } else {
        if (Azure) {
            return process.env.AZURE_API_KEY_PROD;
        } else {
            return process.env.OPENAI_API_KEY;
        }
    }
}

// Get fallback OpenAI API key
async function getFallbackOpenAIKey() {
    if (AWS) {
        const secretsManagerClient = new SecretsManagerClient();
        const input = {
            // SecretId: "AzureOrderVisionOpenAIKey"
            SecretId: "AzureOpenAIKey"
        };
        const command = new GetSecretValueCommand(input);
        const secretsResponse = await secretsManagerClient.send(command);
        const secret = JSON.parse(secretsResponse.SecretString);
        return secret.AzureOpenAIKey;
    } else {
        return process.env.AZURE_API_KEY_PROD;
    }
}

// Initialize embedding OpenAI with race condition handling
async function initializeEmbeddingOpenAI() {
    if (winningEmbeddingOpenAI) {
        console.log("Using cached winning embedding OpenAI instance");
        return winningEmbeddingOpenAI;
    }

    console.log("Initializing embedding OpenAI with race condition handling...");
    
    const primaryApiKey = await getOpenAIKey();
    const fallbackApiKey = await getFallbackOpenAIKey();
    
    // Create primary embedding OpenAI client
    const primaryEmbeddingOpenAI = new OpenAI({
        apiKey: primaryApiKey,
        baseURL: `https://${primaryEmbeddingConfig.resource}.openai.azure.com/openai/deployments/${primaryEmbeddingConfig.model}`,
        defaultQuery: { 'api-version': primaryEmbeddingConfig.apiVersion },
        defaultHeaders: { 'api-key': primaryApiKey },
    });
    
    // Create fallback embedding OpenAI client
    const fallbackEmbeddingOpenAI = new OpenAI({
        apiKey: fallbackApiKey,
        baseURL: `https://${fallbackEmbeddingConfig.resource}.openai.azure.com/openai/deployments/${fallbackEmbeddingConfig.model}`,
        defaultQuery: { 'api-version': fallbackEmbeddingConfig.apiVersion },
        defaultHeaders: { 'api-key': fallbackApiKey },
    });
    
    // Race the two embedding requests with a dummy embedding to determine the winner
    const dummyText = "test embedding for race condition";
    
    try {
        console.log("Racing embedding requests to determine winner...");
        
        // Create promises that handle individual failures
        const primaryPromise = primaryEmbeddingOpenAI.embeddings.create({
            model: primaryEmbeddingConfig.model,
            input: dummyText,
        }).then(response => ({ client: primaryEmbeddingOpenAI, response, type: 'primary', config: primaryEmbeddingConfig }))
        .catch(error => ({ error, type: 'primary' }));
        
        const fallbackPromise = fallbackEmbeddingOpenAI.embeddings.create({
            model: fallbackEmbeddingConfig.model,
            input: dummyText,
        }).then(response => ({ client: fallbackEmbeddingOpenAI, response, type: 'fallback', config: fallbackEmbeddingConfig }))
        .catch(error => ({ error, type: 'fallback' }));
        
        // Race the promises - first successful one wins
        const results = await Promise.allSettled([primaryPromise, fallbackPromise]);
        
        // Find the first successful result
        let winningResponse = null;
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.client) {
                winningResponse = result.value;
                break;
            }
        }
        
        if (winningResponse) {
            winningEmbeddingOpenAI = winningResponse.client;
            winningEmbeddingConfig = winningResponse.config;
            
            // Set the global configuration variables to the winning configuration
            embeddingResource = winningEmbeddingConfig.resource;
            embeddingAPIVersion = winningEmbeddingConfig.apiVersion;
            embeddingModel = winningEmbeddingConfig.model;
            
            console.log(`Embedding race winner: ${winningResponse.type} client`);
            console.log(`Winning configuration: resource=${embeddingResource}, apiVersion=${embeddingAPIVersion}, model=${embeddingModel}`);
            console.log("Embedding OpenAI initialized successfully with race condition handling");
            
            return winningEmbeddingOpenAI;
        } else {
            throw new Error("Both embedding clients failed");
        }
    } catch (error) {
        console.error("Both embedding OpenAI requests failed:", error);
        // Fallback to primary client and config if both fail
        winningEmbeddingOpenAI = primaryEmbeddingOpenAI;
        winningEmbeddingConfig = primaryEmbeddingConfig;
        
        // Set the global configuration variables to the primary configuration
        embeddingResource = primaryEmbeddingConfig.resource;
        embeddingAPIVersion = primaryEmbeddingConfig.apiVersion;
        embeddingModel = primaryEmbeddingConfig.model;
        
        console.log("Using primary embedding client and configuration as fallback");
        console.log(`Fallback configuration: resource=${embeddingResource}, apiVersion=${embeddingAPIVersion}, model=${embeddingModel}`);
        return winningEmbeddingOpenAI;
    }
}

// Helper function to get fallback model name
function getFallbackModel(originalModel) {
    const modelMappings = {
        "gpt-4o": "gpt-4o-order-vision-3",
        "gpt-4o-test": "gpt-4o-order-vision",
        "gpt-4o-2": "gpt-4o-order-vision-3",
        "gpt-4o-test-2": "gpt-4o-order-vision",
        "gpt-4o-3": "gpt-4o-order-vision-3",
        "gpt-4o-test-3": "gpt-4o-order-vision",
        "o3-mini": "o3-mini-order-vision-3",
        "o3-mini-test": "o3-mini-order-vision",
        "o3-mini-2": "o3-mini-order-vision-2",
        "o3-mini-test-2": "o3-mini-order-vision",
        "o3-mini-3": "o3-mini-order-vision-3",
        "o3-mini-test-3": "o3-mini-order-vision"
    };
    return modelMappings[originalModel] || originalModel;
}

// Helper function to use the winning configuration from embedding race
async function raceOpenAIRequests(primaryModel, messages, options = {}) {
    // If we have a winning embedding configuration, use it to determine which client to use
    if (winningEmbeddingConfig) {
        console.log(`Using winning configuration from embedding race: ${winningEmbeddingConfig.resource}`);
        
        const fallbackModel = getFallbackModel(primaryModel);
        const apiVersion = options.apiVersion || '2024-12-01-preview';
        
        // Determine which API key and model to use based on the winning embedding configuration
        let apiKey, model, clientType;
        if (winningEmbeddingConfig.resource === primaryEmbeddingConfig.resource) {
            // Primary won the embedding race, use primary for chat completions
            apiKey = await getOpenAIKey();
            model = primaryModel;
            clientType = 'primary';
        } else {
            // Fallback won the embedding race, use fallback for chat completions
            apiKey = await getFallbackOpenAIKey();
            model = fallbackModel;
            clientType = 'fallback';
        }
        
        console.log(`Using ${clientType} client for OpenAI request based on embedding race winner`);
        
        // Create the winning OpenAI client
        const openAI = new OpenAI({
            apiKey: apiKey,
            baseURL: `https://order-vision-ai.openai.azure.com/openai/deployments/${model}`,
            defaultQuery: { 'api-version': apiVersion },
            defaultHeaders: { 'api-key': apiKey },
        });
        
        // Prepare request options
        const requestOptions = {
            messages: messages,
            ...options.requestOptions
        };
        
        try {
            const response = await openAI.chat.completions.create(requestOptions);
            console.log(`OpenAI request completed successfully using ${clientType} client (from embedding race winner)`);
            return response;
        } catch (error) {
            console.error(`${clientType} OpenAI client failed:`, error.message);
            console.log("Falling back to racing both clients...");
            // Fall through to the racing logic below
        }
    }
    
    // Fallback to racing if no winning config or if the winning client failed
    console.log("Racing OpenAI requests (no winning config or winner failed)...");
    
    const fallbackModel = getFallbackModel(primaryModel);
    const primaryApiKey = await getOpenAIKey();
    const fallbackApiKey = await getFallbackOpenAIKey();
    
    const resource = 'order-vision-ai';
    const apiVersion = options.apiVersion || '2024-12-01-preview';
    
    // Create primary OpenAI client
    const primaryOpenAI = new OpenAI({
        apiKey: primaryApiKey,
        baseURL: `https://${resource}.openai.azure.com/openai/deployments/${primaryModel}`,
        defaultQuery: { 'api-version': apiVersion },
        defaultHeaders: { 'api-key': primaryApiKey },
    });
    
    // Create fallback OpenAI client
    const fallbackOpenAI = new OpenAI({
        apiKey: fallbackApiKey,
        baseURL: `https://${resource}.openai.azure.com/openai/deployments/${fallbackModel}`,
        defaultQuery: { 'api-version': apiVersion },
        defaultHeaders: { 'api-key': fallbackApiKey },
    });
    
    // Prepare request options
    const requestOptions = {
        messages: messages,
        ...options.requestOptions
    };
    
    try {
        // Create promises that handle individual failures
        const primaryPromise = primaryOpenAI.chat.completions.create(requestOptions)
            .then(response => ({ response, type: 'primary' }))
            .catch(error => ({ error, type: 'primary' }));
        
        const fallbackPromise = fallbackOpenAI.chat.completions.create(requestOptions)
            .then(response => ({ response, type: 'fallback' }))
            .catch(error => ({ error, type: 'fallback' }));
        
        // Race the promises - first successful one wins
        const results = await Promise.allSettled([primaryPromise, fallbackPromise]);
        
        // Find the first successful result
        let winningResponse = null;
        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.response) {
                winningResponse = result.value;
                break;
            }
        }
        
        if (winningResponse) {
            console.log(`OpenAI race winner: ${winningResponse.type} client`);
            console.log("OpenAI request completed successfully (raced)");
            return winningResponse.response;
        } else {
            // Log both errors for debugging
            results.forEach((result, index) => {
                if (result.status === 'fulfilled' && result.value.error) {
                    const clientType = index === 0 ? 'primary' : 'fallback';
                    console.error(`${clientType} OpenAI client failed:`, result.value.error.message);
                }
            });
            throw new Error("Both OpenAI requests failed");
        }
    } catch (error) {
        console.error("OpenAI race condition failed:", error);
        throw error;
    }
}

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

const AttnToSchema = z.object({
    name: z.string(),
    phone: z.string(),
    email: z.string(),
});

const CustomFieldsSchema = z.object({
    custom_fields: z.object({
        purchase_order: z.string(),
        order_number: z.string(),
        contract_no: z.string(),
        attn_to: AttnToSchema,
    }),
});

// Define the full schema
const FullResponseSchema = z.object({
    // sold_to: AddressSchema,
    // ship_to: AddressSchema,
    // consignee: AddressSchema,
    po_date: z.string(),
    vat_number: z.array(z.string()),
    fca_account_number: z.string(),
    header_memo: z.string(),
    incoterms: z.string(),
    account_manager: ContactSchema,
    consignee_contact: ContactSchema,
    attention_to_contact: ContactSchema,
    invoice_contact: ContactSchema,
    ship_to_contact: ContactSchema,
    materials: z.array(
        z.object({
            index: z.number(),
            materialNumbers: z.array(z.string()),
            productName: z.string(),
        })
    ),
    batch_numbers: z.array(
        z.object({
            index: z.number(),
            batch: z.number(),
        })
    ),
    address_array: z.array(z.string()),
    currency_code: z.string(),
    reagant_rental: z.string()
    // custom_fields: CustomFieldsSchema,
});

const addressResponseSchema = z.object({
    sold_to: AddressSchema,
    ship_to: AddressSchema,
    consignee: AddressSchema
});

const materialSchema = z.object({
    index: z.number().describe("Material index."),
    materialNumbers: z.array(z.string()).describe("List of material numbers."),
    productName: z.string().describe("Product name."),
});

const materialsSchema = z.object({
    materials: z.array(materialSchema).describe("List of materials."),
});

// Schema for line level memos and materials
const LineLevelMemoSchema = z.object({
    index: z.number().describe("The line item index (0-based)"),
    memo: z.string().describe("Specific memo text for this line item"),
    reason: z.string().describe("Explanation of why this memo belongs to this specific line")
});

const LineLevelMaterialSchema = z.object({
    index: z.number().describe("The line item index (0-based)"),
    materialNumbers: z.array(z.string()).describe("Array of material numbers for this line item"),
    productName: z.string().describe("Product name for this line item"),
    reason: z.string().describe("Explanation of material extraction for this line")
});

const LineLevelResponseSchema = z.object({
    line_level_memos: z.array(LineLevelMemoSchema).describe("Array of line-specific memos"),
    line_level_materials: z.array(LineLevelMaterialSchema).describe("Array of line-specific materials")
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
    const embeddingResponse = await embeddingOpenAI.embeddings.create({
        model: embeddingModel,
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

    console.log("Ship to address english", aiResponse?.ship_to?.address_english);

    if (!address) return "";

    const parsedAddress = await getParsedAddress(address);

    console.log(parsedAddress);

    let addressEmbedding, streetEmbedding, shipToAddressEnglishEmbedding;

    addressEmbedding = await createEmbedding(parsedAddress.data);
    console.log("address for embedding: ", parsedAddress.data);

    if (street) {
        streetEmbedding = await createEmbedding(street);
        console.log("street for embedding: ", street);
    }

    if (type === 'ship_to' && aiResponse?.ship_to?.address_english) {
        shipToAddressEnglishEmbedding = await createEmbedding(aiResponse.ship_to.address_english);
        console.log("ship to address english for embedding: ", aiResponse.ship_to.address_english);
    }

    const parsedStreet = parsedAddress.parsed
        .filter(entry => ['unit', 'house', 'house_number', 'road'].includes(entry.label))
        .map(entry => entry.value)
        .join(', ');

    console.log("parsed street: ", parsedStreet);

    const parsedStreetWithCountry = parsedAddress.parsed
        .filter(entry => ['unit', 'house', 'house_number', 'road', 'country'].includes(entry.label))
        .map(entry => entry.value)
        .join(', ');

    console.log("parsedStreetWithCountry: ", parsedStreetWithCountry);

    const parsedStreetNoHouse = parsedAddress.parsed
        .filter(entry => ['road', 'suburb', 'city', 'country'].includes(entry.label))
        .map(entry => entry.value)
        .join(', ');

    console.log("parsedStreetNoHouse: ", parsedStreetNoHouse);

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

    if (type === 'ship_to' && shipToAddressEnglishEmbedding) {
        const shipToAddressEnglishResults = await searchAddress(initialize, type, name, translatedName, parsedAddress, aiResponse?.ship_to?.address_english, null, city, postalCode, country, addressEmbedding, shipToAddressEnglishEmbedding, vectorNamespace, requiredSeries);
        // deduplicate results
        // addressSearchResults = addressSearchResults.filter((v,i,a)=>a.findIndex(t=>(t.metadata.customer === v.metadata.customer))===i);
        console.log("ship to address english results: ", JSON.stringify(shipToAddressEnglishResults));
        // add to addressSearchResults
        addressSearchResults = addressSearchResults.concat(shipToAddressEnglishResults);

        console.log("combined search results: ", JSON.stringify(addressSearchResults));
    }

    if (!addressSearchResults || addressSearchResults.length === 0) return [];

    // Filter out 'bio-rad' results
    let filteredResults = addressSearchResults.filter(
        (result) =>
            result?.metadata?.name1?.trim() &&
            !result.metadata.name1.toLowerCase().includes("bio-rad") &&
            !result.metadata.name1.toLowerCase().includes("bio rad")
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

    const resultsWithSimilarity = filteredResults.map(result => {
        const nameSimilarity = name ? natural.JaroWinklerDistance(
            name.toLowerCase(),
            result.metadata.name1.toLowerCase()
        ) : 0;

        const translatedNameSimilarity = translatedName ? natural.JaroWinklerDistance(
            translatedName.toLowerCase(),
            result.metadata.name1.toLowerCase()
        ) : 0;

        let maxSimilarity = Math.max(nameSimilarity, translatedNameSimilarity);
        return { ...result, similarity: parseFloat(maxSimilarity.toFixed(3)) * 1000 };
    });

    // international similarity boost; VT020, VT021, VT030
    resultsWithSimilarity.forEach(result => {
        if (result.metadata.international) {
            console.log("international found: ", result.metadata.international);
            let internationalAdded = false;
            resultsWithSimilarity.forEach(r => {
                if (r.metadata.customer === result.metadata.customer) {
                    if (!internationalAdded) {
                        r.similarity = (r.similarity || 0) + 50;
                        internationalAdded = true;
                    } else if (!r.metadata.international) {
                        r.similarity = (r.similarity || 0) + 50;
                    }
                }
            });
        }
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
        score: result.score,
        customer: result.metadata.customer,
        international: result.metadata.international,
        address: result.metadata.oneLineAddress,
        house: result.metadata.houseNumber,
        similarity: (result.similarity) || 0,
    }));
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

    // let filterLevels = [
    //     { country: { '$eq': country } }
    // ];

    const upperCountry = country.toUpperCase();
    let filterLevels = [
        { country: { '$in': [country, upperCountry] } }
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

        const response = await addressSearch(index, embeddingOpenAI, parsedAddress.data, name, translatedName, refinedFilter);
        console.log(response);

        // return response;

        let streetResponse = [];
        if (streetEmbedding) {
            streetResponse = await addressSearch(index, embeddingOpenAI, street, name, translatedName, refinedFilter);
            console.log(streetResponse);
        }

        let parsedStreetResponse = [];
        if (parsedStreet) {
            parsedStreetResponse = await addressSearch(index, embeddingOpenAI, parsedStreet, name, translatedName, refinedFilter);
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
                    let translatedMatches = [];
                    if (translated.translations[0].detectedLanguageCode !== 'en') {
                        translated = translated.translations[0].translatedText;
                        console.log(`Original: ${text}`);
                        console.log(`Translated for new embedding: ${translated}`);
                        const addressEmbedding = await createEmbedding(translated);

                        parsedAddress.translated = true;
                        parsedAddress.data = translated;

                        translatedMatches = await searchAddress(
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

                        parsedAddress = await getParsedAddress(parsedAddress.data);
                        parsedAddress.translated = true;

                        const parsedStreetWithCountry = parsedAddress.parsed
                            .filter(entry => ['unit', 'house', 'house_number', 'road', 'city', 'country'].includes(entry.label))
                            .map(entry => entry.value)
                            .join(', ');

                        console.log("parsed street with country: ", parsedStreetWithCountry);

                        translatedMatches = await searchAddress(
                            index,
                            type,
                            name,
                            translatedName,
                            parsedAddress,
                            street,
                            parsedStreetWithCountry,
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

                        const parsedStreetNoHouse = parsedAddress.parsed
                            .filter(entry => ['road', 'suburb', 'city', 'country'].includes(entry.label))
                            .map(entry => entry.value)
                            .join(', ');

                        console.log("parsedStreetNoHouse: ", parsedStreetNoHouse);

                        console.log("parsed street no house: ", parsedStreetWithCountry);

                        translatedMatches = await searchAddress(
                            index,
                            type,
                            name,
                            translatedName,
                            parsedAddress,
                            street,
                            parsedStreetNoHouse,
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

async function fetchDataFromAnthropic(prompt) {
    const instructions = `# Instructions

### Key Rule
- Never select Bio-Rad for any field. If Bio-Rad is selected, it's incorrect. Bio-Rad is the vendor and should never be referenced.

### Language
- Keep the original language for all fields.
- Do not provide both the original and English translations for any field.
- Example: \`瑩芳有限公司 In Fung Co., Ltd.\` => \`瑩芳有限公司\`

### Extraction Guidelines

1. Material Numbers: Use the header row to help identify the column for material numbers. When recording the index for each row, subtract 1 to exclude the header row from the count. Index starts at 0 without the header.
    - Extract all possible material numbers (alphanumeric patterns) from the data, ensuring that:
        - The results are formatted as arrays of arrays, where each sub-array corresponds to one row of data.
        - Material numbers may appear in any field, including descriptions, and there could be multiple matches within a single row.
        - Use regular expressions to identify material numbers, capturing patterns such as alphanumeric strings with or without hyphens (e.g., LS-041, C-310-5).
        - If the header does not explicitly label a column as "Material," include matches from all potential columns.
        - Also extract the product name from the description and include it in the response.

2. Batch Numbers: Extract batch numbers from the arrays. Use the header row to identify the column containing the batch numbers. When recording the index of each batch number, subtract 1 to exclude the header row from the count.
    - Lot Numbers: Treat lot numbers as batch numbers. These are used interchangeably.

3. Contact Person For Delivery: Extract contact details (name, email, phone). Leave blank for missing info.

4. Attention To Contact: Extract contact details (name, email, phone). Leave blank for missing info.

5. Invoice Contact: Extract contact details (name, email, phone). Leave blank for missing info.

5. Account Manager: Extract account manager details.

6. FCA Account Number: Extract account number from the invoice.

7. VAT Registration Number:
Return an array of all VAT Registration Numbers as alphanumeric only. 
Example found: FR58789947322, FR 18 702 024 795
Return ["FR58789947322","FR18702024795"]

8. Country Code: Extract two-letter codes from addresses.

9. Is currency mentioned? If so, extract the 3-letter currency code.

10. Header memo notes (e.g., lot requests, shipping instructions).

11. Incoterms: Extract Incoterms from the invoice. Provide the 3-letter code only.

12. PO Date: Extract the PO date from the invoice. Provide the date in ISO 8601 format (YYYY-MM-DDThh:mm:ss.SSSZ).

13. Reagant Rental: Extract the reagent rental number if provided.

### Response Format
Use this JSON structure:
{
    "po_date": "2023-10-01T00:00:00.000Z",
    "vat_number": ["VAT Number 1","VAT Number 2"],
    "fca_account_number": "123456",
    "header_memo": "memo notes",
    "incoterms": "3-letter code",
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
    "attention_to_contact": {
        "name": "John Doe",
        "email": "",
        "phone_direct": "",
        "phone_mobile": ""
    },
    "invoice_contact": {
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
    "materials": [
        {
            "index": 0,
            "materialNumbers": [
                "123", 
                "A456"
            ],
            "productName": "name of product"
        }
    ],
    "batch_numbers": [
        {
            "index": 0,
            "batch": 123
        }
    ],
    "address_array": ["address 1", "address 2", ...],
    "currency_code": "USD",
    "reagant_rental": ""
}`;
    try {
        const response = await callAnthropic("claude-3.5-v2", FullResponseSchema, instructions + "\n\n" + prompt);
        return response;
    } catch (e) {
        console.log("Error getting Anthropic response: ", e);
    }
}

/**
 * Fetch data from OpenAI based on the given prompt.
 * @param {string} prompt - Prompt to send to OpenAI.
 * @returns {Object} AI response object.
 */
async function fetchDataFromOpenAI(prompt, apiKey) {
    try {
        const model = (pinecone_env === "PROD") ? "gpt-4o" : "gpt-4o-test";
        const apiVersion = '2024-12-01-preview';

        const instructions = `# Instructions

### Key Rule
- Never select Bio-Rad for any field. If Bio-Rad is selected, it's incorrect. Bio-Rad is the vendor and should never be referenced.

### Language
- Keep the original language for all fields.
- Do not provide both the original and English translations for any field.
- Example: \`瑩芳有限公司 In Fung Co., Ltd.\` => \`瑩芳有限公司\`

### Extraction Guidelines

1. Material Numbers: Use the header row to help identify the column for material numbers. When recording the index for each row, subtract 1 to exclude the header row from the count. Index starts at 0 without the header.
    - Extract all possible material numbers (alphanumeric patterns) from the data, ensuring that:
        - The results are formatted as arrays of arrays, where each sub-array corresponds to one row of data.
        - Material numbers may appear in any field, including descriptions, and there could be multiple matches within a single row.
        - Use regular expressions to identify material numbers, capturing patterns such as alphanumeric strings with or without hyphens (e.g., LS-041, C-310-5).
        - If the header does not explicitly label a column as "Material," include matches from all potential columns.
        - Also extract the product name from the description and include it in the response.

2. Batch Numbers: Extract batch numbers from the arrays. Use the header row to identify the column containing the batch numbers. When recording the index of each batch number, subtract 1 to exclude the header row from the count.
    - Lot Numbers: Treat lot numbers as batch numbers. These are used interchangeably.

3. Contact Person For Delivery: Extract contact details (name, email, phone). Leave blank for missing info.

4. Attention To Contact: Extract contact details (name, email, phone). Leave blank for missing info.

5. Invoice Contact: Extract contact details (name, email, phone). Leave blank for missing info.

5. Account Manager: Extract account manager details.

6. FCA Account Number: Extract account number from the invoice.

7. VAT Registration Number:
Return an array of all VAT Registration Numbers as alphanumeric only. 
Example found: FR58789947322, FR 18 702 024 795
Return ["FR58789947322","FR18702024795"]

8. Country Code: Extract two-letter codes from addresses.

9. Is currency mentioned? If so, extract the 3-letter currency code.

10. Header memo notes (e.g., lot requests, shipping instructions).

11. Incoterms: Extract Incoterms from the invoice. Provide the 3-letter code only.

12. PO Date: Extract the PO date from the invoice. Provide the date in ISO 8601 format (YYYY-MM-DDThh:mm:ss.SSSZ).

13. Reagant Rental: Extract the reagent rental number if provided.

### Response Format
Use this JSON structure:
{
    "po_date": "2023-10-01T00:00:00.000Z",
    "vat_number": ["VAT Number 1","VAT Number 2"],
    "fca_account_number": "123456",
    "header_memo": "memo notes",
    "incoterms": "3-letter code",
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
    "attention_to_contact": {
        "name": "John Doe",
        "email": "",
        "phone_direct": "",
        "phone_mobile": ""
    },
    "invoice_contact": {
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
    "materials": [
        {
            "index": 0,
            "materialNumbers": [
                "123", 
                "A456"
            ],
            "productName": "name of product"
        }
    ],
    "batch_numbers": [
        {
            "index": 0,
            "batch": 123
        }
    ],
    "address_array": ["address 1", "address 2", ...],
    "currency_code": "USD",
    "reagant_rental": ""
}`;

        const messages = [
            { role: "system", content: instructions },
            { role: "user", content: prompt }
        ];

        const response = await raceOpenAIRequests(model, messages, {
            apiVersion,
            requestOptions: {
                response_format: zodResponseFormat(FullResponseSchema, "response"),
            }
        });

        const openAIPrice = priceCalculator.calculateTokenPrice(aiModel, response.usage);
        console.log("openAIPrice: ", openAIPrice);
        const aiResponse = response.choices[0].message.content.trim();
        return JSON.parse(aiResponse);

    } catch (e) {
        console.log("Error getting AI response: ", e);
    }
}

async function fetchCustomFieldsFromAnthropic(prompt) {
    const instructions = `# Instructions

    1. Custom Fields: Also extract purchase order, order number, and contract number if present.

    ### Response Format
    Use this JSON structure:
    {
        "custom_fields": {
            "purchase_order": "PO123456",
            "order_number": "ON123456",
            "contract_number": "CN123456"
        }
    }`;
    try {
        const response = await callAnthropic("claude-3.5-v2", CustomFieldsSchema, instructions + "\n\n" + prompt);
        return response;
    } catch (e) {
        console.log("Error getting Anthropic response: ", e);
    }
}

async function fetchCustomFieldsFromOpenAI(prompt, apiKey) {
    try {
        const model = (pinecone_env === "PROD") ? "o3-mini-2" : (process.env.CUSTOM_FIELDS_MODEL || "o3-mini-test-2");
        const apiVersion = '2024-12-01-preview';

        console.log(model);

        const instructions = `# Instructions

1. Custom Fields: Also extract purchase order, order number, contract number, and delivery contact information if present.

2. Attention To Contact: Extract delivery-specific contact information, including:
   - Name of person responsible for receiving deliveries
   - Phone number
   - Email address
   
   Focus only on:
   - The person responsible for receiving deliveries, not the company name.
   - "Attention To", "Attn:", "Deliver To", or "Receiving Contact" fields
   - Any mention of delivery contact, site receiver, or person to receive goods
   
   Exclude:
   - Contacts listed under headings like Invoice Contact, Billing, Ordering Contact, Sales Rep, or Accounts Payable
   - Any general company contact unless clearly tied to delivery or receipt of goods
   - This should not not pull company names. This is for people to contact.

### Response Format
Use this JSON structure:
{
    "custom_fields": {
        "purchase_order": "PO123456",
        "order_number": "ON123456",
        "contract_number": "CN123456",
        "attn_to": {
            "name": "John Doe",
            "phone": "555-1234",
            "email": "john.doe@company.com"
        }
    }
}`;

        const messages = [
            { role: "system", content: instructions },
            { role: "user", content: prompt }
        ];

        const response = await raceOpenAIRequests(model, messages, {
            apiVersion,
            requestOptions: {
                response_format: zodResponseFormat(CustomFieldsSchema, "response"),
                reasoning_effort: "high"
            }
        });

        const openAIPrice = priceCalculator.calculateTokenPrice(aiModel, response.usage);
        console.log("openAIPrice: ", openAIPrice);
        const aiResponse = response.choices[0].message.content.trim();
        return JSON.parse(aiResponse);

    } catch (e) {
        console.log("Error getting AI response: ", e);
    }
}

async function fetchMaterialsFromAnthropic(prompt) {
    console.log(prompt);
    const instructions = `# Instructions

### Extraction Guidelines
1. Material Numbers: Use the header row to help identify the column for material numbers. When recording the index for each row, subtract 1 to exclude the header row from the count. Index starts at 0 without the header.
    - Extract all possible material numbers (alphanumeric patterns) from the data, ensuring that:
        - The results are formatted as arrays of objects, where each object contains the index, material numbers, and product name.
        - Material numbers may appear in any field, including descriptions, and there could be multiple matches within a single row.
        - Use regular expressions to identify material numbers, capturing patterns such as alphanumeric strings with or without hyphens (e.g., LS-041, C-310-5).
        - If the header does not explicitly label a column as "Material," include matches from all potential columns.
        - Also extract the product name from the description and include it in the response.
        - Ensure that all material numbers within a single row are captured and included in the response.

### Response Format
Use this JSON structure:
{
    "materials": [
        {
            "index": 0,
            "materialNumbers": [
                "123", 
                "A456"
            ],
            "productName": "name of product"
        }
    ]
}`;
    try {
        const response = await callAnthropic(materialsSchema, instructions + "\n\n" + prompt);
        return response;
    } catch (e) {
        console.log("Error getting Anthropic response: ", e);
    }
}

/**
 * Fetch materials from OpenAI based on the given prompt.
 * @param {string} prompt - Prompt to send to OpenAI.
 * @returns {Object} AI response object.
 */
async function fetchMaterialsFromOpenAI(prompt, apiKey) {
    console.log(prompt);
    try {
        const model = (pinecone_env === "PROD") ? "gpt-4o-3" : "gpt-4o-test-3";
        const apiVersion = '2024-08-01-preview';

        const instructions = `# Instructions

### Extraction Guidelines
1. Material Numbers: Use the header row to help identify the column for material numbers. When recording the index for each row, subtract 1 to exclude the header row from the count. Index starts at 0 without the header.
    - Extract all possible material numbers (alphanumeric patterns) from the data, ensuring that:
        - The results are formatted as arrays of objects, where each object contains the index, material numbers, and product name.
        - Material numbers may appear in any field, including descriptions, and there could be multiple matches within a single row.
        - Use regular expressions to identify material numbers, capturing patterns such as alphanumeric strings with or without hyphens (e.g., LS-041, C-310-5).
        - If the header does not explicitly label a column as "Material," include matches from all potential columns.
        - Also extract the product name from the description and include it in the response.
        - Ensure that all material numbers within a single row are captured and included in the response.

### Response Format
Use this JSON structure:
{
    "materials": [
        {
            "index": 0,
            "materialNumbers": [
                "123", 
                "A456"
            ],
            "productName": "name of product"
        }
    ]
}`;

        const messages = [
            { role: "system", content: instructions },
            { role: "user", content: prompt }
        ];

        const response = await raceOpenAIRequests(model, messages, {
            apiVersion,
            requestOptions: {
                response_format: { type: 'json_object' }
            }
        });

        const openAIPrice = priceCalculator.calculateTokenPrice(aiModel, response.usage);
        console.log("openAIPrice: ", openAIPrice);
        const aiResponse = response.choices[0].message.content.trim();
        return JSON.parse(aiResponse);

    } catch (e) {
        console.log("Error getting AI response: ", e);
    }
}

async function fetchLineLevelMemosFromOpenAI(itemContent, apiKey) {
    console.log("=== LINE LEVEL MEMOS EXTRACTION - ENHANCED LOGGING ===");
    
    try {
        const model = (pinecone_env === "PROD") ? "o3-mini-3" : "o3-mini-test-3";
        const apiVersion = '2024-12-01-preview';

        console.log(`Using model: ${model}`);

        // Parse and prepare item content with enhanced context
        const parsedItems = (Array.isArray(itemContent) ? itemContent : []).map((item, itemIndex) => {
            const itemContentText = item.content || "";
            const itemDescription = item.valueObject?.Description?.content || "";
            const itemProductName = item.productName || "";
            
            console.log(`\n--- ITEM ${itemIndex} LINE LEVEL MEMO ANALYSIS ---`);
            console.log(`Item content: "${itemContentText}"`);
            console.log(`Item description: "${itemDescription}"`);
            console.log(`Item product name: "${itemProductName}"`);
            
            return {
                index: itemIndex,
                itemContent: itemContentText,
                itemDescription: itemDescription,
                itemProductName: itemProductName,
                // Include all available content for comprehensive analysis
                allContent: Object.values(item.valueObject || {})
                    .map(value => value.content)
                    .filter(Boolean)
                    .join(" | ")
            };
        });

        console.log(`\n=== PROCESSING ${parsedItems.length} ITEMS FOR LINE LEVEL MEMOS ===`);

        const instructions = `# Instructions

### Context
You are provided with items that have been extracted from invoices. Each item contains:
- **index**: The line item index (0-based)
- **itemContent**: Raw content extracted from the invoice line
- **itemDescription**: Product description from the invoice
- **itemProductName**: Product name if available
- **allContent**: All available content fields for this line item

### Line Level Memo Extraction Guidelines
1. **Focus on Line-Specific Information**: Extract memos that are specific to individual line items, NOT general document information
2. **Relevant Memo Types**: Look for:
   - Lot requests or batch-specific instructions
   - Line-specific shipping instructions
   - Item-specific handling requirements
   - Product-specific notes or requirements
   - Quantity or delivery specifications for that line
   - Line-specific customer requests or modifications

3. **Avoid General Information**: Do NOT extract:
   - Header-level shipping instructions that apply to the entire order
   - General document notes not tied to specific line items
   - Company information or general terms
   - Information that belongs to other line items

4. **Material Number Extraction**: Also extract Bio-Rad material numbers found in line items:
   - Look for alphanumeric patterns that represent material/product codes
   - Include material numbers found in descriptions or product names
   - Ensure material numbers are tied to the correct line item

### Decision Criteria
- **Line Specificity**: The memo must be clearly related to the specific line item
- **Contextual Relevance**: The memo should make sense in the context of that particular product/line
- **Avoid Cross-Contamination**: Don't assign memos from one line to another line
- **Empty Results**: Return empty arrays if no line-specific memos are found

### Response Format
Use this JSON structure:
{
    "line_level_memos": [
        {
            "index": 0,
            "memo": "specific memo text for this line item",
            "reason": "explanation of why this memo belongs to this specific line"
        }
    ],
    "line_level_materials": [
        {
            "index": 0,
            "materialNumbers": [
                "123", 
                "A456"
            ],
            "productName": "name of product",
            "reason": "explanation of material extraction for this line"
        }
    ]
}`;

        const messages = [
            { role: "system", content: instructions },
            { role: "user", content: JSON.stringify(parsedItems) }
        ];

        console.log("\n=== SENDING REQUEST TO OPENAI ===");
        console.log("Request payload size:", JSON.stringify(parsedItems).length, "characters");
        console.log("Items being processed:", parsedItems.length);

        let response;
        try {
            // Create timeout promise
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('OpenAI request timeout after 45 seconds')), 45000)
            );

            // Race between API call and timeout
            response = await Promise.race([
                raceOpenAIRequests(model, messages, {
                    apiVersion,
                    requestOptions: {
                        response_format: { type: 'json_object' }
                    }
                }),
                timeoutPromise
            ]);
        } catch (timeoutError) {
            console.log("❌ OpenAI API call timed out or failed:", timeoutError.message);
            console.log("Returning empty response due to timeout");
            return {
                line_level_memos: [],
                line_level_materials: []
            };
        }

        const openAIPrice = priceCalculator.calculateTokenPrice(aiModel, response.usage);
        console.log("openAIPrice: ", openAIPrice);
        
        const aiResponse = response.choices[0].message.content.trim();
        console.log("\n=== AI LINE LEVEL MEMOS RESPONSE ===");
        console.log("Raw AI Response:", aiResponse);
        
        const lineLevelResponse = JSON.parse(aiResponse);
        console.log("Parsed AI Response:", JSON.stringify(lineLevelResponse, null, 2));

        // Enhanced logging for memo assignments
        if (lineLevelResponse?.line_level_memos) {
            console.log("\n=== PROCESSING LINE LEVEL MEMO ASSIGNMENTS ===");
            lineLevelResponse.line_level_memos.forEach((memo, memoIndex) => {
                console.log(`\n--- MEMO ASSIGNMENT ${memoIndex} ---`);
                console.log(`Line index: ${memo.index}`);
                console.log(`Memo content: "${memo.memo}"`);
                console.log(`AI reason: ${memo.reason || 'No reason provided'}`);
                
                // Bounds checking
                if (memo.index < 0 || memo.index >= parsedItems.length) {
                    console.log(`❌ ERROR: Memo index ${memo.index} is out of bounds for items array of length ${parsedItems.length}`);
                } else {
                    console.log(`✓ Valid memo assignment for item ${memo.index}`);
                }
            });
        }

        if (lineLevelResponse?.line_level_materials) {
            console.log("\n=== PROCESSING LINE LEVEL MATERIAL ASSIGNMENTS ===");
            lineLevelResponse.line_level_materials.forEach((material, materialIndex) => {
                console.log(`\n--- MATERIAL ASSIGNMENT ${materialIndex} ---`);
                console.log(`Line index: ${material.index}`);
                console.log(`Material numbers: ${JSON.stringify(material.materialNumbers)}`);
                console.log(`Product name: "${material.productName}"`);
                console.log(`AI reason: ${material.reason || 'No reason provided'}`);
                
                // Bounds checking
                if (material.index < 0 || material.index >= parsedItems.length) {
                    console.log(`❌ ERROR: Material index ${material.index} is out of bounds for items array of length ${parsedItems.length}`);
                } else {
                    console.log(`✓ Valid material assignment for item ${material.index}`);
                }
            });
        }

        console.log("\n=== LINE LEVEL MEMOS EXTRACTION COMPLETED ===");
        return lineLevelResponse;

    } catch (e) {
        console.log("❌ ERROR in fetchLineLevelMemosFromOpenAI:", e);
        console.log("Stack trace:", e.stack);
        return {
            line_level_memos: [],
            line_level_materials: []
        };
    }
}

async function fetchAddressFromAnthropic(prompt) {
    const instructions = `# Instructions

    ### Key Rule
    - Never select Bio-Rad for any field. If Bio-Rad is selected, it's incorrect. Bio-Rad is the vendor and should never be referenced.

    ### Language
    - Keep the original language for all fields. For addresses, provide both the original and English translations.
    - Do not provide both the original and English translations in the same field.
    - Example: \`瑩芳有限公司 In Fung Co., Ltd.\` => \`瑩芳有限公司\` in name and \`In Fung Co., Ltd.\` in name_english.

    ### Extraction Guidelines
    1. Sold To (Buyer), Ship To, and Consignee: Extract these fields.  
        - Sold to and ship to should be companies, not names of individuals.
        - If only a sold to is present, use that as the ship to.
        - The \`name\` and \`address\` fields are crucial and must always be extracted if available.  
        - If \`name\` is missing, leave it blank but ensure the address is still extracted.  
        - Only if a name is in English, extract the English name in the \`name_english\` field.
        - Only select the address for address fields; do not include the name of the business in the address.  
        - Use \`ship_to\` information if \`consignee\` is missing.  
        - Never use vendor information (e.g., Bio-Rad).  
        - Note: \`sold_to\` (or \`buyer\`) can appear as Distributor or similar as well. As long as it's not Bio-Rad, this is correct.
        - For country codes, extract the two-letter code from the address.
        - Provide the reason why you selected the address and name.

    2. Bio-Rad Check: If \`sold_to\` (or \`buyer\`), \`ship_to\`, or \`consignee\` contains "Bio-Rad" or "Bio Rad", blank all fields for that entry.

    3. If customer code is available, assign it to customer_code in sold_to. 
        - This cannot start with any other number than a 1 or 2. Starting with a 0 is wrong as well.
        - This value must start with a 1 and be exactly 7 digits long. If it's longer or shorter it's incorrect, so leave it blank.
    4. If address code is available, assign it to customer_code in ship_to. 
        - This cannot start with any other number than a 1 or 2. Starting with a 0 is wrong as well.
        - This must start with a 1 or 2 and be exactly 7 digits long. If it's longer or shorter it's incorrect, so leave it blank.

    `;
    try {
        const response = await callAnthropic("claude-3.5-v2", addressResponseSchema, instructions + "\n\n" + prompt);
        return response;
    } catch (e) {
        console.log("Error getting Anthropic response: ", e);
    }
}

async function fetchAddressFromOpenAI(prompt, apiKey) {
    try {
        const model = (pinecone_env === "PROD") ? "o3-mini" : (process.env.ADDRESS_MODEL || "o3-mini-test");
        const apiVersion = '2024-12-01-preview';

        console.log(model);

        // TEMP PLACEHOLDER; FIGURE OUT IF WE CAN HAVE THIS ONLY FOR NON-US ADDRESSES
        const getCustomerAndAddressCodes = (vectorIndexName === "asdfasldifjasdli") ?
            `3. If customer code is available, assign it to customer_code in sold_to. 
    - This cannot start with any other number than a 1 or 2. Starting with a 0 is wrong as well.
    - This value must start with a 1 and be exactly 7 digits long. If it's longer or shorter it's incorrect, so leave it blank.
4. If address code is available, assign it to customer_code in ship_to. 
    - This cannot start with any other number than a 1 or 2. Starting with a 0 is wrong as well.
    - This must start with a 1 or 2 and be exactly 7 digits long. If it's longer or shorter it's incorrect, so leave it blank.` :
            `3. Return "" for customer code.
4. Return "" for address code.`;

        const instructions = `# Instructions

### Key Rule
- Never select Bio-Rad for any field. If Bio-Rad is selected, it's incorrect. Bio-Rad is the vendor and should never be referenced.

### Language
- Keep the original language for all fields. For addresses, provide both the original and English translations.
- Do not provide both the original and English translations in the same field.
- Example: \`瑩芳有限公司 In Fung Co., Ltd.\` => \`瑩芳有限公司\` in name and \`In Fung Co., Ltd.\` in name_english.

### Extraction Guidelines
1. Sold To (Buyer), Ship To, and Consignee: Extract these fields.  
    - Sold to and ship to should be companies, not names of individuals.
    - If only a sold to is present, use that as the ship to.
    - The \`name\` and \`address\` fields are crucial and must always be extracted if available.  
    - If \`name\` is missing, leave it blank but ensure the address is still extracted.  
    - Only if a name is in English, extract the English name in the \`name_english\` field.
    - Only select the address for address fields; do not include the name of the business in the address.  
    - Use \`ship_to\` information if \`consignee\` is missing.  
    - Never use vendor information (e.g., Bio-Rad).  
    - Note: \`sold_to\` (or \`buyer\`) can appear as Distributor or similar as well. As long as it's not Bio-Rad, this is correct.
    - For country codes, extract the two-letter code from the address.
    - Provide the reason why you selected the address and name.

2. Bio-Rad Check: If \`sold_to\` (or \`buyer\`), \`ship_to\`, or \`consignee\` contains "Bio-Rad" or "Bio Rad", blank all fields for that entry.

${getCustomerAndAddressCodes}

### Response Format
Use this JSON structure:
{
    "sold_to": {
        "name": "ACME Corp",
        "name_english": "ACME Corp",
        "address": "1234 Main St, Anytown, USA",
        "address_english": "1234 Main St, Anytown, USA",
        "address_reason": "value",
        "address_street": "1234 Main"
        "address_city": "Anytown",
        "address_postal_code": "12345",
        "address_country_code": "US",
        "customer_code": 1234567,
        "reason": "reason"
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
        "address_country_code": "US",
        "customer_code": 1234567,
        "reason": "reason"
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
        "address_country_code": "US",
        "reason": "reason"
    }
}`;

        const messages = [
            { role: "system", content: instructions },
            { role: "user", content: prompt }
        ];

        const response = await raceOpenAIRequests(model, messages, {
            apiVersion,
            requestOptions: {
                reasoning_effort: "high",
                response_format: zodResponseFormat(addressResponseSchema, "response"),
            }
        });

        const aiResponse = response.choices[0].message.content.trim();
        return JSON.parse(aiResponse);

    } catch (e) {
        console.log("Error getting AI response: ", e);
    }
}

/* function to process invoice in Azure
    input: PDF
    output: result
*/
/**
 * Process invoice in Azure.
 * @param {string} PDF - PDF file content.
 * @param {string} model - Model to use for processing.
 * @returns {Object} Result of the processing.
 */
async function azureProcessing(PDF, model) {
    let key;
    const endpoint = parserEndpoint;
    if (AWS) {
        const secretsManagerClient = new SecretsManagerClient();
        const input = {
            SecretId: (pinecone_env === "PROD") ? "azure-form-recognizer-order-vision" : "azureAIFormRecognizerParserKey"
        };
        const command = new GetSecretValueCommand(input);
        const response = await secretsManagerClient.send(command);
        const secret = JSON.parse(response.SecretString);
        key = secret.ParserKey;
    } else {
        key = parserKey;
    }

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
                features: ["KeyValuePairs", "queryFields"],
                queryFields: ["Purchase_Order", "OrderNumber", "ContractNo"], // "ShipToAddress", "BillToAddress"
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

    // return (await poller.pollUntilDone()).body.analyzeResult; // @azure-rest/ai-document-intelligence@1.0.0-beta.3
    return poller.body.analyzeResult; // @azure-rest/ai-document-intelligence@1.0.0; Released: 2024-12-16
}

/**
 * Convert all string values in an object to lowercase.
 * @param {Object} obj - Object to convert.
 * @returns {Object} Object with all string values in lowercase.
 */
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

/**
 * Perform final address check using OpenAI.
 * @param {Object} aiResponse - AI response object.
 * @returns {Object} Updated AI response object.
 */
async function finalAddressCheckOpenAI(aiResponse, azureResource = "ordervision", apiKey) {
    // THIS HAS BEEN WORKING WITH ALL RELEASES; DO NOT CHANGE!
    const model = (pinecone_env === "PROD") ? "o3-mini-3" : "o3-mini-test-3";
    const apiVersion = '2024-12-01-preview';

    console.log(JSON.stringify(aiResponse));
    const addresses = { "sold_to": aiResponse.sold_to, "ship_to": aiResponse.ship_to, "consignee": aiResponse.consignee };
    console.log("final address check: ", JSON.stringify(addresses));

    const newObj = Object.fromEntries(
        Object.entries(addresses).map(([k, v]) => [
            k,
            {
                ...((({ name, translatedName, address, address_english, translatedAddress, number, similarity, customer_code }) =>
                ({
                    name,
                    translatedName,
                    address,
                    address_english,
                    translatedAddress,
                    number,
                    similarity,
                    customer_code: (customer_code && /^[12]\d{6}$/.test(customer_code)) ? customer_code : ""
                }))(v)),
                number: v.number ? Array.from(new Map(v.number
                    .filter(n => n.score >= 0.64)
                    .map(n => [JSON.stringify(n), n])).values()) : []
            }
        ])
    );

    console.log("newObj: ", JSON.stringify(newObj));

    const instructions = `## Address Check

### Matching Procedure
Go through each case starting with A and proceed to the next until a match is either found or not for each address type (sold_to, ship_to, and consignee).

#### Case A: If sold_to.customer_code or ship_to.customer_code is present:
- stop evaluation for that address type.
- assign that to sold_to or ship_to respectively.

---

#### Case B: At Least One Entry Has a Similarity Score Above 830
1. **Identify Entries Above 830:**
   - For each address type (sold_to, ship_to, consignee), iterate through the corresponding "number" array.
   - **Ignore similarity scores of 0.**
   - Collect all entries with a similarity score strictly above 830.

2. **Above 830 Matches:**
    - **Name Comparison:** Compare the \`name\` or \`translatedName\` from the address with \`number.name\`.
    - **Address Comparison:** Compare \`address\` or \`address_english\` with \`number.address\` and \`number.house\`.
    - If the street name is completely different then it is not correct.
    - Determine the best match.

---

#### Case C: No Entry Has a Similarity Score Above 830
   - If a close match is found based on \`name\` or \`translatedName\` and \`address\` or \`address_english\`, return its index.
   - If multiple close matches are found, use additional criteria (\`name\` or \`translatedName\` and \`address\` or \`address_english\`) to select the best one.
   - If no match qualifies, return \`false\` for that address type.

---

### Required Response Format
Return a JSON object with:
- The index of the best match (0-based) for each address type, or \`false\` if no match is found. If customer_code just return that number.
- A corresponding reason for the choice.

**Example:**
{
    "sold_to": 0,
    "sold_to_reason": "the reason for choice",
    "ship_to": false,
    "ship_to_reason": "the reason for choice",
    "consignee": 3,
    "consignee_reason": "the reason for choice"
}
`;

    const messages = [
        { "role": "system", "content": instructions },
        { "role": "user", "content": JSON.stringify(newObj) }
    ];

    try {
        console.log(messages);

        const response = await raceOpenAIRequests(model, messages, {
            apiVersion,
            requestOptions: {
                response_format: { type: 'json_object' }
            }
        });

        const aiAddressCheckResponse = response.choices[0].message.content.trim();
        console.log("aiAddressCheckResponse: ", aiAddressCheckResponse);
        const checkResponse = JSON.parse(aiAddressCheckResponse);

        if (checkResponse.sold_to === false) {
            // aiResponse.sold_to_address = {
            //     ...aiResponse.sold_to,
            //     number: aiResponse.sold_to?.number?.[0] || {}
            // };
            // aiResponse.sold_to = {};
            aiResponse.sold_to.delete = true;
            aiResponse.sold_to.number = aiResponse.sold_to?.number?.[0] || {};
            console.log("sold_to removed");
        } else {
            checkResponse.sold_to = parseInt(checkResponse.sold_to);
            console.log("checkResponse.sold_to: ", checkResponse.sold_to);
            if (checkResponse.sold_to > 1000) {
                aiResponse.sold_to.number = {
                    "customer": checkResponse.sold_to
                };
            } else {
                aiResponse.sold_to.number = newObj.sold_to.number[checkResponse.sold_to];
            }
        }
        if (checkResponse.ship_to === false) {
            // aiResponse.ship_to_address = { 
            //     ...aiResponse.ship_to, 
            //     number: aiResponse.ship_to?.number?.[0] || {} 
            // };
            // aiResponse.ship_to = {};   
            aiResponse.ship_to.delete = true;
            aiResponse.ship_to.number = aiResponse.ship_to?.number?.[0] || {};
            console.log("ship_to removed");
        } else {
            checkResponse.ship_to = parseInt(checkResponse.ship_to);
            console.log("checkResponse.ship_to: ", checkResponse.ship_to);
            if (checkResponse.ship_to > 1000) {
                aiResponse.ship_to.number = {
                    "customer": checkResponse.ship_to
                };
            } else {
                aiResponse.ship_to.number = newObj.ship_to.number[checkResponse.ship_to];
            }
        }
        if (checkResponse.consignee === false) {
            aiResponse.consignee = {};
            console.log("consignee removed");
        } else {
            checkResponse.consignee = parseInt(checkResponse.consignee);
            console.log("checkResponse.consignee: ", checkResponse.consignee);
            if (checkResponse.consignee > 1000) {
                aiResponse.consignee.number = {
                    "customer": checkResponse.consignee
                };
            } else {
                aiResponse.consignee.number = newObj.consignee.number[checkResponse.consignee];
            }
        }

        if (checkResponse.ship_to !== false && checkResponse.consignee === false) {
            aiResponse.consignee = aiResponse.ship_to;
            console.log("consignee updated to ship_to");
        }
        if (checkResponse.ship_to === false && checkResponse.consignee !== false) {
            aiResponse.ship_to = aiResponse.consignee;
            console.log("ship_to updated to consignee");
        }
        console.log("checkResponse: ", JSON.stringify(checkResponse));
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

async function finalMaterialsCheckOpenAI(items, azureResource = "ordervision", apiKey) {
    const model = (pinecone_env === "PROD") ? "o3-mini-2" : "o3-mini-test-2";
    const apiVersion = '2024-12-01-preview';

    console.log("=== FINAL MATERIALS CHECK OPENAI - ENHANCED LOGGING ===");
    console.log(`Using model: ${model}`);

    // Parse the items if it's a string and combine materialai and material2ai arrays
    const parsedItems = (typeof items === 'string' ? JSON.parse(items) : items)?.valueArray?.map((item, itemIndex) => {
        const combinedMaterials = [
            ...(item.materialai || []),
            ...(item.material2ai || [])
        ];
        
        // Extract item content/description for AI context
        const itemContent = item.content || "";
        const itemDescription = item.valueObject?.Description?.content || "";
        const itemProductName = item.productName || "";
        
        console.log(`\n--- ITEM ${itemIndex} MATERIALS BEFORE AI CHECK ---`);
        console.log(`Current material: "${item.material}"`);
        console.log(`Item content: "${itemContent}"`);
        console.log(`Item description: "${itemDescription}"`);
        console.log(`Item product name: "${itemProductName}"`);
        console.log(`materialai count: ${item.materialai?.length || 0}`);
        console.log(`material2ai count: ${item.material2ai?.length || 0}`);
        console.log(`Combined materials count: ${combinedMaterials.length}`);
        
        combinedMaterials.forEach((mat, idx) => {
            console.log(`  [${idx}]: id="${mat.id}", metadata.material="${mat.metadata?.material}", score=${mat.score}`);
        });
        
        return { 
            combinedMaterials,
            itemContent,
            itemDescription,
            itemProductName,
            currentMaterial: item.material
        };
    }) || [];

    const instructions = `## Material Matching

### Context
You are provided with items that have been extracted from invoices. Each item contains:
- **itemContent**: Raw content extracted from the invoice line
- **itemDescription**: Product description from the invoice
- **itemProductName**: Product name if available
- **currentMaterial**: The currently assigned material ID
- **combinedMaterials**: Array of potential material matches with scores and metadata

### Matching Procedure
Analyze each item's combinedMaterials array and find the best material match based on the following criteria:

1. **Content Analysis**: Compare the itemContent, itemDescription, and itemProductName against the material descriptions and metadata
2. **Score Priority**: Prioritize materials with score=0 (exact matches) over higher scores
3. **Semantic Matching**: Consider how well the material description matches the actual item being ordered
4. **Material Relevance**: Ensure the selected material actually corresponds to what the customer is ordering
5. **Quality Assessment**: Use scoring, similarity, and metadata to determine the best match
6. **Index Selection**: When multiple materials have the same score, prefer the first one (index 0)

### Decision Criteria
- **Exact Match (score=0)**: Strongly prefer these, but verify they match the item content
- **Semantic Relevance**: The material description should align with what the customer is actually ordering
- **Content Consistency**: The selected material should make sense given the item's description and context
- **False Positives**: Return \`false\` if no material in the array actually matches what the customer is ordering

### Required Response Format
Return a JSON array of objects, each containing:
- index: The index of the best match (0-based) within the combinedMaterials array, or \`false\` if no match is found or if no match is close enough to what the customer is actually ordering.
- reason: A detailed reason explaining why this material was selected, including reference to the item content and how it matches the chosen material.

Example:
{
    "materials": [
        {
            "index": 0,
            "reason": "Selected material at index 0 because it has an exact match (score=0) and the material description 'EQAS IA PROG 12X5ML' closely matches the item description 'EQAS IA Monthly Program', indicating this is the correct Bio-Rad product the customer is ordering."
        }
    ]
}`;

    const messages = [
        { "role": "system", "content": instructions },
        { "role": "user", "content": JSON.stringify(parsedItems) }
    ];

    try {
        console.log("\n=== SENDING REQUEST TO OPENAI ===");
        console.log("Request payload size:", JSON.stringify(parsedItems).length, "characters");
        
        const response = await raceOpenAIRequests(model, messages, {
            apiVersion,
            requestOptions: {
                response_format: { type: 'json_object' },
                reasoning_effort: "high"
            }
        });

        const aiMaterialCheckResponse = response.choices[0].message.content.trim();
        console.log("\n=== AI MATERIAL CHECK RESPONSE ===");
        console.log("Raw AI Response:", aiMaterialCheckResponse);
        
        const materialResponse = JSON.parse(aiMaterialCheckResponse);
        console.log("Parsed AI Response:", JSON.stringify(materialResponse, null, 2));

        if (materialResponse?.materials) {
            console.log("\n=== PROCESSING AI MATERIAL SELECTIONS ===");
            
            materialResponse.materials.forEach((material, index) => {
                console.log(`\n--- PROCESSING ITEM ${index} ---`);
                console.log(`AI selected index: ${material.index}`);
                console.log(`AI reason: ${material.reason}`);
                
                if (items.valueArray?.[index]) {
                    const selectedMaterialIndex = material.index;
                    const currentMaterial = items.valueArray[index].material;
                    
                    console.log(`Current material before update: "${currentMaterial}"`);

                    if (selectedMaterialIndex === false) {
                        // Remove the material if it is not determined to be close enough
                        console.log(`AI determined no good match - removing all materials`);
                        items.valueArray[index].material2 = "";
                        items.valueArray[index].material = "";
                        items.valueArray[index].materialai = [];
                        items.valueArray[index].material2ai = [];
                        console.log(`✓ Material at item index ${index} removed - not close enough match`);
                    } else {
                        // Combine the arrays to find the selected material
                        const combinedMaterials = [
                            ...(items.valueArray[index].materialai || []),
                            ...(items.valueArray[index].material2ai || [])
                        ];
                        
                        console.log(`Combined materials array length: ${combinedMaterials.length}`);
                        console.log(`AI selected index: ${selectedMaterialIndex}`);
                        
                        // Bounds checking with detailed error reporting
                        if (selectedMaterialIndex < 0 || selectedMaterialIndex >= combinedMaterials.length) {
                            console.log(`❌ ERROR: selectedMaterialIndex ${selectedMaterialIndex} is out of bounds for combinedMaterials array of length ${combinedMaterials.length}`);
                            console.log(`Available materials in combined array:`);
                            combinedMaterials.forEach((m, i) => {
                                console.log(`  [${i}]: id="${m.id}", metadata.material="${m.metadata?.material}", score=${m.score}`);
                            });
                            console.log(`Keeping original material: "${currentMaterial}"`);
                        } else {
                            const selectedMaterial = combinedMaterials[selectedMaterialIndex];
                            console.log(`Selected material object:`, JSON.stringify(selectedMaterial, null, 2));

                            // Enhanced assignment logic - prioritize metadata.material over id
                            let materialId;
                            if (selectedMaterial.metadata?.material) {
                                materialId = selectedMaterial.metadata.material;
                                console.log(`Using selectedMaterial.metadata.material: "${materialId}"`);
                            } else if (selectedMaterial.id) {
                                materialId = selectedMaterial.id;
                                console.log(`Using selectedMaterial.id: "${materialId}"`);
                            } else {
                                console.log(`❌ ERROR: No valid material ID found in selected material`);
                                console.log(`Selected material structure:`, selectedMaterial);
                                materialId = currentMaterial; // Keep original
                                console.log(`Keeping original material: "${materialId}"`);
                            }
                            
                            // Assign the material ID
                            const previousMaterial = items.valueArray[index].material;
                            items.valueArray[index].material = materialId;
                            
                            console.log(`✓ Material assignment completed:`);
                            console.log(`  Previous: "${previousMaterial}"`);
                            console.log(`  New: "${materialId}"`);
                            console.log(`  Source: combined array index ${selectedMaterialIndex}`);
                            console.log(`  Selected material details: id="${selectedMaterial.id}", metadata.material="${selectedMaterial.metadata?.material}", score=${selectedMaterial.score}`);
                        }
                    }
                } else {
                    console.log(`❌ ERROR: items.valueArray[${index}] is undefined`);
                }
            });
        } else {
            console.log("❌ ERROR: No materials array in AI response");
        }

        console.log("\n=== FINAL MATERIALS CHECK COMPLETED ===");
        return items;
    } catch (e) {
        console.log("❌ ERROR in finalMaterialsCheckOpenAI:", e);
        console.log("Stack trace:", e.stack);
        return items; // Return original items on error instead of empty array
    }
}

/* main function
    input: event, callback
    output: response
*/
/**
 * Main function to process the event.
 * @param {Object} event - Event object.
 * @param {Function} callback - Callback function.
 * @returns {Object} Response object.
 */
async function main(event, callback) {
    console.log("Event received:", JSON.stringify(event));

    // Get OpenAI API key for use throughout the function
    const apiKey = await getOpenAIKey();

    // Initialize embeddingOpenAI with race condition handling
    embeddingOpenAI = await initializeEmbeddingOpenAI();

    const initialize = await initializePinecone(pinecone_api_key, vectorIndexName);

    // Get attachment from metadata
    if (!event.metadata?.Attachments?.[0]) {
        const errorMsg = "No attachments found in metadata";
        await sendAlert({
            message: `Start processing failed: ${errorMsg}. Timestamp: ${event.timestamp || 'Unknown'}`
        });
        throw new Error(errorMsg);
    }

    // Select the first attachment that has .Type of "Purchase Order"
    let attachmentName;
    const purchaseOrderAttachment = event.metadata.Attachments.find(attachment =>
        attachment.Type === "Purchase Order"
    );

    if (!purchaseOrderAttachment) {
        const errorMsg = "No attachment with Type 'Purchase Order' found";
        await sendAlert({
            message: `Start processing failed: ${errorMsg}. Timestamp: ${event.timestamp || 'Unknown'}`
        });
        throw new Error(errorMsg);
    }

    attachmentName = purchaseOrderAttachment.AttachmentName;
    const s3Key = `uploads/${event.timestamp}/${attachmentName}`;

    let PDF;
    try {
        const getCommand = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: s3Key
        });
        const response = await s3Client.send(getCommand);
        PDF = await response.Body.transformToString('base64');
    } catch (error) {
        console.error('Error getting file from S3:', error);
        await sendAlert({
            message: `Start processing failed: Unable to retrieve file ${attachmentName} from S3. Timestamp: ${event.timestamp}, Error: ${error.message}`
        });
        throw new Error(`Failed to get file ${attachmentName} from S3: ${error.message}`);
    }

    if (!PDF) {
        const errorMsg = "No PDF content received from S3";
        await sendAlert({
            message: `Start processing failed: ${errorMsg}. File: ${attachmentName}, Timestamp: ${event.timestamp}`
        });
        throw new Error(errorMsg);
    }

    console.log(`Processing attachment: ${attachmentName}`);

    console.time("PDF processing time");

    let [resultLayout, resultInvoice] = await Promise.all([
        azureProcessing(PDF, "prebuilt-layout"),
        azureProcessing(PDF, "prebuilt-invoice")
    ]);

    console.timeEnd("PDF processing time");

    // let resultLayout = await azureProcessing(PDF, "prebuilt-layout");
    let resultContent = "";
    let translatedPromptContent = "";
    if (resultLayout) {

        console.log('full resultLayout:', JSON.stringify(resultLayout));
        const paragraphs = getParagraphs(resultLayout.paragraphs);
        // const keyValuePairs = getKeyValuePairs(resultLayout.keyValuePairs);
        try {
            let finalTables = [];
            try {
                finalTables = await createTables(resultLayout.tables);
            } catch (e) {
                console.log("error forming tables: ", finalTables);
            }
            // resultContent = `**Paragraphs**:\n${JSON.stringify(paragraphs)}\n\n**Tables**:\n${JSON.stringify(finalTables)}\n\n**Everything else**:\n${JSON.stringify(resultLayout.content)}`;
            // resultContent = `**Paragraphs**:\n${JSON.stringify(paragraphs)}\n\n**Tables**:\n${JSON.stringify(finalTables)}\n\n**Key Value Pairs**:\n${JSON.stringify(keyValuePairs)}`;
            resultContent = `**Paragraphs**:\n${JSON.stringify(paragraphs)}\n\n**Tables**:\n${JSON.stringify(finalTables)}`;
            // console.log("Content:\n", resultContent);
            const translatedParagraphs = await translateText({ text: paragraphs.join("\n") }, "en-US");
            const translatedTables = await translateText({ text: finalTables.join("\n") }, "en-US");
            translatedPromptContent = `**Paragraphs**:\n${JSON.stringify(translatedParagraphs?.translations[0]?.translatedText)}\n\n**Tables**:\n${JSON.stringify(translatedTables?.translations[0]?.translatedText)}\n\n`;
        }
        catch (e) {
            console.log("Error in processing: ", e);
        }
    }

    // let resultInvoice = await azureProcessing(PDF, "prebuilt-invoice");
    let invoice, invoiceContent, itemContent, invoiceResultDocuments, Declaration, Contract;
    let contractFound = false;
    let invoiceValueArrayContent = [];
    if (resultInvoice) {
        console.log('full resultInvoice:', JSON.stringify(resultInvoice));
        console.log("Page count:", resultInvoice.pages.length);

        for (const page of resultInvoice.pages) {
            for (const word of page.words) {
                if (word.content.toLowerCase() === 'declaration') {
                    console.log('Declaration found:', word.content, 'on page:', page.pageNumber);
                    Declaration = {
                        pageNumber: page.pageNumber,
                        content: word.content
                    };
                }
            }
            for (const line of page.lines) {
                // clean line content and leave only alphanumeric characters
                const cleanedLineContent = line.content.replace(/[^a-zA-Z0-9]/g, '');
                if (cleanedLineContent === 'CONTRACT') {
                    if (contractFound) {
                        console.log('Second CONTRACT found:', line.content, 'on page:', page.pageNumber);
                        Contract = {
                            pageNumber: page.pageNumber,
                            content: line.content
                        };
                        break; // Exit the loop after finding the second occurrence
                    } else {
                        contractFound = true;
                    }
                }
            }
        }

        invoiceResultDocuments = resultInvoice.documents[0];
        invoice = invoiceResultDocuments.fields;
        console.log(invoice?.Items);

        if (invoice.Items && invoice?.Items?.valueArray) {
            // filter out all items from the valueArray that don't have valueObject
            if (invoice.Items && invoice?.Items?.valueArray) {
                invoice.Items.valueArray = invoice.Items.valueArray.filter(item => item.valueObject);
            }

            console.log("Invoice items value array: ", JSON.stringify(invoice?.Items?.valueArray));

            itemContent = invoice?.Items?.valueArray.map((item, index) => ({
                index: index,
                content: Object.values(item.valueObject).map(value => value.content).filter(Boolean)
            }));
            console.log("Item Content: ", JSON.stringify(itemContent));

            const items = getDirectContentValues(invoice.Items);
            console.log("Items: ", items);
        }

        let translatedItemContent;
        try {
            // for large requests, break this up into smaller chunks; EXAMPLE FROM QA: OR0000002139
            translatedItemContent = await translateText({ text: JSON.stringify(itemContent) }, "en-US");
            translatedPromptContent += `**Invoice Items**:\n${JSON.stringify(translatedItemContent?.translations[0]?.translatedText)}`;
        } catch (error) {
            console.error("Error translating item content:", error);
            translatedPromptContent += `**Invoice Items**:\n${JSON.stringify(itemContent)}`;
        }

        try {
            let finalTables = [];
            try {
                finalTables = await createTables(resultInvoice.tables);
            } catch (e) {
                console.log("error forming tables: ", finalTables);
            }
            invoiceContent = `**Invoice Items**:\n${JSON.stringify(finalTables)}`;
            console.log("Content:\n", invoiceContent);
        }
        catch (e) {
            console.log("Error in processing: ", e);
        }
    }

    const promptContent = resultContent + '\n\nItem Content: ' + JSON.stringify(itemContent);
    console.log("Prompt Content:\n\n", promptContent);

    // let translatedPromptContent = await translateText({ text: promptContent }, "en-US");
    // translatedPromptContent = translatedPromptContent?.translations[0]?.translatedText || promptContent;
    console.log("Translated Prompt Content:\n\n", translatedPromptContent);

    const [
        openAIResponse,
        customFieldsResponse,
        addressResponse,
        // openAIMaterialsResponse,
        lineLevelMemosResponse
    ] = await Promise.all([
        fetchDataFromOpenAI(promptContent, apiKey),
        // fetchDataFromAnthropic(promptContent),
        fetchCustomFieldsFromOpenAI(translatedPromptContent, apiKey),
        // fetchCustomFieldsFromAnthropic(translatedPromptContent),
        fetchAddressFromOpenAI(promptContent, apiKey),
        // fetchAddressFromAnthropic(promptContent),
        // fetchMaterialsFromOpenAI(JSON.stringify(itemContent), apiKey),
        // fetchMaterialsFromAnthropic(JSON.stringify(itemContent))
        // fetchLineLevelMemosFromOpenAI(promptContent, apiKey) // too much data and AI has trouble associating to the correct lines
        fetchLineLevelMemosFromOpenAI(itemContent, apiKey)
    ]);
    console.log("OpenAI Response:", JSON.stringify(openAIResponse));
    console.log("OpenAI Custom Fields Response:", JSON.stringify(customFieldsResponse));
    console.log("Address Response:", JSON.stringify(addressResponse));
    // console.log("OpenAI Materials Response:", JSON.stringify(openAIMaterialsResponse));
    console.log("Line Level Memos Response:", JSON.stringify(lineLevelMemosResponse));

    let confidenceAvg = 0.000;
    let confidenceScores = 0;
    let soldToConfidence = 0;
    let shipToConfidence = 0;

    console.log("sold_to address", openAIResponse?.sold_to || "");
    console.log("ship_to address", openAIResponse?.ship_to || "");
    console.log("consignee address", openAIResponse?.consignee || "");

    // update openAIResponse sold_to, ship_to, and consignee
    if (addressResponse) {
        openAIResponse.sold_to = addressResponse?.sold_to || {};
        openAIResponse.ship_to = addressResponse?.ship_to || {};
        openAIResponse.consignee = addressResponse?.consignee || {};
        console.log("final openAIResponse: ", JSON.stringify(openAIResponse));
    }

    if (openAIResponse.sold_to?.name_english && !openAIResponse.ship_to?.name) {
        openAIResponse.ship_to.name = openAIResponse.sold_to.name_english;
    }
    if (openAIResponse.ship_to?.address_english && !openAIResponse.sold_to?.address) {
        openAIResponse.sold_to.address = openAIResponse.ship_to.address_english;
    }

    const materials = openAIResponse.materials || [];
    const batches = openAIResponse.batch_numbers || [];
    const addressArray = openAIResponse.address_array || [];
    const countryKey = openAIResponse.sold_to?.address_country_code || openAIResponse.ship_to?.address_country_code || null;
    const lineLevelMemos = lineLevelMemosResponse.line_level_memos || [];
    const lineLevelMaterials = lineLevelMemosResponse.line_level_materials || [];

    console.log("materials: ", JSON.stringify(materials));
    console.log("lineLevelMemos: ", JSON.stringify(lineLevelMemos));
    console.log("lineLevelMaterials: ", JSON.stringify(lineLevelMaterials));

    // merge line level materials with materials array
    materials.forEach(m => {
        const lvl = lineLevelMaterials.find(l => l.index === m.index);
        if (lvl) {
            m.materialNumbers = Array.from(new Set([...m.materialNumbers, ...lvl.materialNumbers]));
        }
    });
    console.log("Merged materials: ", JSON.stringify(materials));

    let aiResponse = openAIResponse || {};

    aiResponse = toLowerCaseDeep(aiResponse);
    // if (accountManager) {
    //     aiResponse.account_manager.number = accountManager?.[0]?.metadata?.customer ?? null;
    // }

    // FOR GETCUSTOMER NUMBER IT WILL ALWAYS BE BEST TO GET THE CORRESPONDING NUMBER AND ADDRESS 
    // FROM THE INTERNATIONAL AND STANDARD ADDRESS FOR EACH

    // aiResponse.sold_to_address_customer = await getCustomer(initialize, "sold_to", aiResponse, aiResponse.sold_to_name, aiResponse.sold_to_address, aiResponse.sold_to_address_street, aiResponse.sold_to_address_city, aiResponse.sold_to_address_postal_code, aiResponse.sold_to_address_country, addressArray);

    const target = "en-US";

    // Helper function to set translated name
    async function setTranslatedName(entity, fallbackName) {
        if (!entity) return;
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

    // Set sold_to details
    await setTranslatedName(aiResponse.sold_to, aiResponse.ship_to);
    aiResponse.sold_to_address_customer = await setAddressCustomer("sold_to", aiResponse.sold_to);

    // Set ship_to details
    await setTranslatedName(aiResponse.ship_to, aiResponse.sold_to);
    aiResponse.ship_to_address_customer = await setAddressCustomer("ship_to", aiResponse.ship_to);

    // Set consignee details
    await setTranslatedName(aiResponse.consignee, aiResponse.ship_to);
    aiResponse.consignee_address_customer = await setAddressCustomer("consignee", aiResponse.consignee);

    aiResponse.variation = process.env.VARIATION || vectorNamespace;
    // placeholder
    // aiResponse.account_manager = {
    //     "name": "John Doe",
    //     "email": "john.doe@abc.com",
    //     "phone_direct": "1234567890",
    //     "phone_mobile": "1234567890"
    // }
    // // add the mapping for the account manager number using getCustomer
    // aiResponse.account_manager.number = 1234567890;

    // Note if both are null, it will only log the first one
    if (!aiResponse.ship_to_address_customer && !aiResponse.consignee_address_customer) {
        console.log("No ship_to_address_customer or consignee_address_customer found. Using consignee_address_customer.");
        aiResponse.ship_to = {};
        aiResponse.consignee = {};
    } else if (!aiResponse.ship_to_address_customer) {
        console.log("No ship_to_address_customer found. Using consignee_address_customer.");
        aiResponse.ship_to_address_customer = aiResponse.consignee_address_customer;
        aiResponse.ship_to = {};
    } else if (!aiResponse.consignee_address_customer) {
        console.log("No consignee_address_customer found. Using ship_to_address_customer.");
        aiResponse.consignee_address_customer = aiResponse.ship_to_address_customer;
        aiResponse.consignee = {};
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
    // aiResponse = await finalAddressCheckOpenAI(aiResponse);

    console.time("Final Address Check Time");
    const fastestResponse = await Promise.race([
        finalAddressCheckOpenAI(aiResponse, "ordervision", apiKey),
        // finalAddressCheckOpenAI(aiResponse, "bio-sf-ai", apiKey) // Assuming this is the second function
    ]);
    console.timeEnd("Final Address Check Time");
    aiResponse = fastestResponse;

    if (aiResponse.ship_to?.number?.customer && !aiResponse.sold_to?.number?.customer) {
        const matches = checkKNVP(aiResponse.ship_to?.number?.customer);
        if (matches && matches.length > 0) {
            const filteredMatches = matches.filter(match => match.customer.toString().startsWith('1'));
            if (filteredMatches.length === 1) {
                console.log(`Match for ${aiResponse.ship_to?.number?.customer}: ${filteredMatches[0].customer}`);
                aiResponse.sold_to.number = {};
                aiResponse.sold_to.number.customer = parseInt(filteredMatches[0].customer);
                soldToConfidence = 1;
            }
        } else {
            console.log(`No matches found for ${aiResponse.ship_to?.number?.customer}`);
        }
    }

    // after final check, assign the customer number to the address
    aiResponse.sold_to_address_customer = aiResponse.sold_to?.delete ? "" : aiResponse.sold_to?.number?.customer;
    aiResponse.ship_to_address_customer = aiResponse.ship_to?.delete ? "" : aiResponse.ship_to?.number?.customer;
    aiResponse.consignee_address_customer = aiResponse.consignee?.number?.customer;

    // Check if sold_to is empty and ship_to starts with "1"
    if (!aiResponse.sold_to_address_customer && aiResponse.ship_to_address_customer?.toString().startsWith("1")) {
        console.log("sold_to is empty, using ship_to as sold_to...");
        console.log("removing sold_to:", aiResponse.sold_to);
        aiResponse.sold_to = { ...aiResponse.ship_to };
        aiResponse.sold_to_address_customer = aiResponse.ship_to_address_customer;
    }

    // Add attention to contact information
    if (customFieldsResponse.custom_fields?.attn_to) {
        aiResponse.attn_to = customFieldsResponse.custom_fields.attn_to;
    }

    // Header-level date formatting similar to reference implementation
    let foundInvoiceDate = false;
    let invoiceDateContent;
    let invoiceDateValue;
    let invoiceDate;
    let US = false;

    // Check if we have invoice date information
    if (invoice.InvoiceDate) {
        foundInvoiceDate = true;
        invoiceDateContent = invoice.InvoiceDate.content;
        invoiceDateValue = invoice.InvoiceDate.value || invoice.InvoiceDate.valueDate;
    }

    let vendorAddress = false;
    if (invoice.VendorAddress && invoice.VendorAddress.value && invoice.VendorAddress.value.state) {
        vendorAddress = true;
        if (invoice.VendorAddress && invoice.VendorAddress.value && invoice.VendorAddress.value.state && 
            (stateAbbreviations.includes(invoice.VendorAddress.value.state.toLowerCase())
            || stateNames.includes(invoice.VendorAddress.value.state.toLowerCase()))) {
            US = true;
        }
    }

    // if vendor address was not found check remittance address
    if (!vendorAddress && invoice.RemittanceAddress && invoice.RemittanceAddress.value && invoice.RemittanceAddress.value.state && 
        (stateAbbreviations.includes(invoice.RemittanceAddress.value.state.toLowerCase())
        || stateNames.includes(invoice.RemittanceAddress.value.state.toLowerCase()))) {
        US = true;  
    }

    // Format the invoice date if we have the content and it's not US
    if (!US && invoiceDateContent) {
        try {
            const formattedDate = await formatDates(US, invoiceDateContent);
            if (formattedDate) {
                invoiceDate = new Date(formattedDate).toISOString(); // toISOString() converts to UTC
            } else {
                invoiceDate = new Date(invoiceDateValue).toISOString();
            }
        } catch (e) {
            console.log("error with date formatting: ", e);
            invoiceDate = invoiceDateValue;
        }
    } else {
        invoiceDate = invoiceDateValue;
    }

    // Add the corrected invoice date to the response
    if (foundInvoiceDate && invoiceDate) {
        invoice.CorrectedInvoiceDate = {
            "value": invoiceDate
        };
        // Update aiResponse.po_date with the formatted invoice date
        aiResponse.po_date = invoiceDate;
        console.log("Azure doc ai invoice date value: ", invoiceDateValue);
        console.log("Corrected invoice date: ", invoiceDate);
    }

    const { invoiceResultDocuments: updatedResultDocuments, createdVariables } = createVariablesFromJson(aiResponse, invoiceResultDocuments);
    console.log("AI Variables: ", createdVariables);
    console.log("Full result: ", JSON.stringify(updatedResultDocuments));
    console.log(openAIResponse);

    invoice.QuoteNumber = findQuoteNumber(resultInvoice.content);
    // find RRC, always 10 digits, always starts with 3000. Ex: 3000215379
    invoice.RRC ??= {};
    
    // Get RRC numbers from document content
    const documentRrcNumbers = findRRC(resultInvoice.content);
    
    // Get RRC numbers from event payload (sent from classification lambda)
    const eventRrcNumbers = event.RRC || [];
    
    // Merge and deduplicate RRC numbers
    const allRrcNumbers = [...new Set([...documentRrcNumbers, ...eventRrcNumbers])];
    
    // Set the final RRC value - always use array format for consistency
    invoice.RRC.value = allRrcNumbers;
    
    if (allRrcNumbers.length > 1) {
        console.log(`Multiple RRC numbers found: ${allRrcNumbers.join(', ')}`);
    } else if (allRrcNumbers.length === 1) {
        console.log(`Single RRC number found: ${allRrcNumbers[0]}`);
    } else {
        console.log("No RRC numbers found");
    }
    
    // Log the sources for debugging
    if (documentRrcNumbers.length > 0) {
        console.log(`RRC numbers from document: ${documentRrcNumbers.join(', ')}`);
    }
    if (eventRrcNumbers.length > 0) {
        console.log(`RRC numbers from customer inquiry: ${eventRrcNumbers.join(', ')}`);
    }

    // PONumber, AmountDue, TotalTax
    const keysToCheck = ["InvoiceId", "InvoiceDate", "CurrencyCode", "InvoiceTotal"];

    const randomPrefix =
        pinecone_env !== "PROD"
            ? `AI_${Math.floor(Math.random() * 1000000)}_`
            : "";

    // Clean and prefix the fields
    const cleanAndPrefix = (field) => {
        if (!field) return;
        if (field.content) {
            field.content = field.content.replace(/(^\W+|\W+$)/g, '');
            if (randomPrefix && !field.content.startsWith(randomPrefix)) {
                field.content = `${randomPrefix}${field.content}`;
            }
        }
        if (field.valueString) {
            field.valueString = field.valueString.replace(/(^\W+|\W+$)/g, '');
            if (randomPrefix && !field.valueString.startsWith(randomPrefix)) {
                field.valueString = `${randomPrefix}${field.valueString}`;
            }
        }
    };

    if (invoice.InvoiceId?.content && invoice.PurchaseOrder?.content) {
        console.log("Purchase Order before overwrite: ", invoice.PurchaseOrder.content);
        invoice.PurchaseOrder = invoice.InvoiceId;
    }

    if ((!invoice.InvoiceId && !invoice.PurchaseOrder) && (invoice.ContractNo?.valueString || invoice.OrderNumber?.valueString)) {
        console.log("Neither InvoiceId nor PurchaseOrder found.");
        if (invoice.ContractNo?.valueString) {
            invoice.InvoiceId = invoice.ContractNo;
        } else if (invoice.OrderNumber?.valueString) {
            invoice.InvoiceId = invoice.OrderNumber;
        }
    }

    // make sure sends back the custom fields
    // invoice.CustomFields = aiResponse.custom_fields || {};

    // if ((!invoice.InvoiceId && !invoice.PurchaseOrder) && 
    //     (customFieldsResponse.custom_fields?.purchase_order || invoice.Purchase_Order?.valueString)) {
    //     console.log("Neither InvoiceId nor PurchaseOrder found.");
    //     invoice.InvoiceId = {
    //         content: (customFieldsResponse.custom_fields?.purchase_order) ? customFieldsResponse.custom_fields?.purchase_order : invoice.Purchase_Order?.valueString,
    //         valueString: (customFieldsResponse.custom_fields?.purchase_order) ? customFieldsResponse.custom_fields?.purchase_order : invoice.Purchase_Order?.valueString
    //     };
    //     invoice.PurchaseOrder = {
    //         content: (customFieldsResponse.custom_fields?.purchase_order) ? customFieldsResponse.custom_fields?.purchase_order : invoice.Purchase_Order?.valueString,
    //         valueString: (customFieldsResponse.custom_fields?.purchase_order) ? customFieldsResponse.custom_fields?.purchase_order : invoice.Purchase_Order?.valueString
    //     };

    // the custom query parameters from Azure are giving bad responses: AI_995836_Purchase Order, AI_479813_All or the there shall In
    if (customFieldsResponse.custom_fields?.purchase_order) {
        console.log("Neither InvoiceId nor PurchaseOrder found.");
        invoice.InvoiceId = {
            content: customFieldsResponse.custom_fields?.purchase_order,
            valueString: customFieldsResponse.custom_fields?.purchase_order
        };
        invoice.PurchaseOrder = {
            content: customFieldsResponse.custom_fields?.purchase_order,
            valueString: customFieldsResponse.custom_fields?.purchase_order
        };
    }

    // Add attention to contact information
    if (customFieldsResponse.custom_fields?.attn_to) {
        invoice.attn_to = customFieldsResponse.custom_fields.attn_to;
    }

    cleanAndPrefix(invoice.InvoiceId);
    cleanAndPrefix(invoice.PurchaseOrder);

    if (invoice.Items && invoice?.Items?.valueArray) {
        const material_pinecone_api_key = process.env.PINECONE_PROD_API_KEY; // MATERIAL_PINECONE_API_KEY
        const materialVectorIndexName = 'materials'; // sf-ai
        const materialPineconeInitialization = await initializePinecone(material_pinecone_api_key, materialVectorIndexName);
        // Only include items up to the Declaration page if set
        // const maxPage = (Declaration) ? (Declaration.pageNumber - 1): resultInvoice?.pages?.length;

        // Sets to earliest occurrence of Declaration or Contract (2nd occurrence)
        const maxPage = (Declaration && Contract)
            ? Math.min(Declaration.pageNumber, Contract.pageNumber) - 1
            : (Declaration)
                ? (Declaration.pageNumber - 1)
                : (Contract)
                    ? (Contract.pageNumber - 1)
                    : resultInvoice?.pages?.length;

        invoice.Items.valueArray = await Promise.all(
            invoice.Items.valueArray.map(async (item, index) => {
                if (!item.boundingRegions.some(region => region.pageNumber <= maxPage)) {
                    return null; // Skip items that don't meet the condition
                } else {
                    item.material = "";
                    item.materialai = [];
                    item.batch = "";
                }

                confidenceAvg += item.confidence;
                confidenceScores++;

                if (item.valueObject && item.valueObject.Date && item.valueObject.Date.content && !item.valueObject.Date.valueDate) {
                    console.log("trying to correct...");
                    const US = (countryKey === "US");
                    let result;
                    try {
                        result = await formatDates(US, item.valueObject.Date.content);
                    } catch (e) {
                        console.log("Error formatting date: ", e);
                    }
                    if (result) item.valueObject.Date.valueDate = result;
                }

                if (item.valueObject && !item.valueObject["Amount"]) {
                    console.log("No Amount for item: ", item);
                    // check if item has unit price and quantity
                    if (item.valueObject["UnitPrice"]?.valueCurrency?.amount > 0 && item.valueObject["Quantity"]?.valueNumber > 0) {
                        item.valueObject["Amount"] = {
                            "type": "currency",
                            "valueCurrency": {
                                // round to 2 decimal places
                                "amount": parseFloat(
                                    (item.valueObject["UnitPrice"].valueCurrency.amount * item.valueObject["Quantity"].valueNumber).toFixed(2)
                                ),
                            }
                        }
                        console.log("Amount for item updated: ", item.valueObject["Amount"]);
                    }
                }

                // if (item.valueObject) {
                //     Object.keys(item.valueObject).forEach(k => {
                //         if (item.valueObject[k].confidence) {
                //             // console.log(`Confidence for ${k}`, item.valueObject[k].confidence);
                //             confidenceAvg += item.valueObject[k].confidence;
                //             confidenceScores++;
                //         }
                //     });
                // }

                if (lineLevelMemos[index]) {
                    item.lineLevelMemo = lineLevelMemos[index];
                }

                // find the material for the item mapping to the index
                // const material = materials.find(material => material.index === index);
                // if (material) {
                //     item.material = material.material;
                // }

                const material = materials.find(entry => entry.index === index);
                if (material) {
                    item.material = Array.isArray(material.materialNumbers)
                        ? material.materialNumbers
                        : [material.materialNumbers]; // Ensure `item.materialNumbers` is always an array
                }

                if (item.valueObject && item.valueObject["ProductCode"]?.valueString) {
                    // add to first element of material array
                    item.material = [item.valueObject["ProductCode"].valueString, ...item.material];
                }

                // deduplicate the material array
                item.material = [...new Set(item.material)];

                console.log("check item materials to be tested: ", item.material);

                // find the batch number for the item mapping to the index
                // batches = [
                //     {
                //         "index": 4,
                //         "batch": "54140"
                //     }
                // ]
                console.log("Batches: ", batches);
                const batch = batches.find(batch => batch.index === index);
                if (batch) {
                    item.batch = batch.batch;
                }

                // if (materials[index]) {
                //     item.material = materials[index];
                // }

                console.log("search material: ", item.material);

                if (material && material.productName) {
                    item.productName = material.productName;
                }

                if (openAIResponse?.currency_code && openAIResponse.currency_code.toUpperCase() === "NTD") {
                    console.log("Converting currency code from NTD to TWD");
                    openAIResponse.currency_code = "TWD";
                }

                // Amount
                if (item?.valueObject?.Amount?.valueCurrency?.currencyCode && openAIResponse?.currency_code && /^[a-zA-Z]{3}$/.test(openAIResponse.currency_code)) {
                    console.log("Item Currency Code: ", item.valueObject.Amount.valueCurrency.currencyCode);
                    if (item.valueObject.Amount.valueCurrency.currencyCode !== openAIResponse.currency_code.toUpperCase()) {
                        console.log("updating item currency code to invoice currency code");
                        item.valueObject.Amount.valueCurrency.currencyCode = openAIResponse.currency_code.toUpperCase();
                    }
                }

                // Unit Price -- this is where the currency was mapped to
                if (item?.valueObject?.UnitPrice?.valueCurrency?.currencyCode && openAIResponse?.currency_code && /^[a-zA-Z]{3}$/.test(openAIResponse.currency_code)) {
                    console.log("Item Currency Code: ", item.valueObject.UnitPrice.valueCurrency.currencyCode);
                    if (item.valueObject.UnitPrice.valueCurrency.currencyCode !== openAIResponse.currency_code.toUpperCase()) {
                        console.log("updating item currency code to invoice currency code");
                        item.valueObject.UnitPrice.valueCurrency.currencyCode = openAIResponse.currency_code.toUpperCase();
                    }
                }

                // if Quantity is missing and Unit is present, assign Quantity to Unit
                if (!item?.valueObject?.Quantity && item?.valueObject?.Unit && item?.valueObject?.Unit?.valueString) {
                    item.valueObject.Quantity = item.valueObject.Unit;
                    item.valueObject.Quantity.valueNumber = parseInt(item.valueObject.Unit.valueString.replace(/\D/g, ''));
                    delete item.valueObject.Quantity.valueString;
                }

                if (item?.valueObject?.Description?.content) {
                    console.log("Item Description: ", item.valueObject.Description.content.trim());
                    const target = "en-US";
                    let translated = await translateText({ text: item.valueObject.Description.content.trim() }, target);
                    translated = translated.translations[0].translatedText;
                    console.log(`Item Description: ${translated}`);
                    const materialai = await searchMaterial(materialPineconeInitialization, embeddingOpenAI, item.material, item.valueObject.Description.content, false, countryKey);
                    console.log("Material AI: ", materialai);

                    item.material = materialai?.[0]?.metadata?.material || item.material;
                    item.materialai = materialai || [];

                    console.log("before material two check:", material, item.material, item.materialai);
                    if (material && material.productName) {
                        // const itemMaterial = extractMaterials(item.valueObject.Description.content.trim());
                        const itemMaterial = [
                            ...extractMaterials(item.valueObject.Description.content.trim()),
                            ...extractMaterials(item.content.trim())
                        ];
                        const material2 = await searchMaterial(materialPineconeInitialization, embeddingOpenAI, itemMaterial, material.productName, true, countryKey);
                        if (material2 && material2.length > 0) {
                            item.material2 = material2[0].id;
                            item.material2ai = material2;

                            try {
                                // if (item.materialai && item.materialai.length > 0 && item.materialai[0].score != 0 && item.materialai[0].score < 0.6 && (material2[0].score == 0 || material2[0].score > item.materialai[0].score)) {
                                //     // overwrite material with material2
                                //     item.material = material2[0].id;
                                // }
                                if (item.materialai && item.materialai.length > 0 && item.materialai[0].score != 0 && material2[0].score == 0) {
                                    const material2Id = material2[0].id;
                                    if (!isNaN(material2Id) && parseInt(material2Id) > 100) {
                                        // overwrite material with material2 if it's an integer and greater than 100
                                        item.material = material2Id;
                                    } else if (isNaN(material2Id)) {
                                        // overwrite material with material2 if it's alphanumeric
                                        item.material = material2Id;
                                    }
                                }
                            } catch (e) {
                                console.log("Error comparing material scores for overwrite: ", e);
                            }

                            // // overwrite material with material2
                            // item.material = material2[0].id;
                            // item.materialai = material2;
                        }
                    }
                } else {
                    if (item && item.material && item.material.length > 0) {
                        const materialai = await searchMaterial(materialPineconeInitialization, embeddingOpenAI, item.material, false, countryKey);
                        console.log("Material AI: ", materialai);
                        // if materialai is not found, remove the material
                        if (materialai.length === 0) {
                            item.material = '';
                        }
                        item.materialai = materialai || [];
                    }
                }

                item.material = Array.isArray(item.material)
                    ? item.material[0]
                    : item.material;

                item.batch = Array.isArray(item.batch)
                    ? item.batch[0]
                    : item.batch;

                if (item.batch && item.material && item.batch === item.material) {
                    console.log("removing batch since it should not equal material", item.batch, item.material);
                    item.batch = "";
                }

                return item;
            })
        );
        invoice.Items.valueArray = invoice.Items.valueArray.filter(item => item !== null);
    }

    if (invoice.AISoldToAddressCustomer?.value > 0 && invoice.AIShipToAddressCustomer?.value > 0) {

        // Feb 7, 2025
        const itemWeight = 0.60;
        const soldToWeight = 0.20;
        const shipToWeight = 0.20;

        const itemConfidenceAvg = (confidenceAvg / confidenceScores) * itemWeight;
        console.log("Items confidence average (weighted): ", itemConfidenceAvg * 100);

        if (invoice.AISoldToAddressCustomer?.value > 0) {
            console.log("Adding AISoldToAddressCustomer");
            soldToConfidence = 1;
        } else {
            console.log("No AISoldToAddressCustomer");
        }
        soldToConfidence *= soldToWeight;

        if (invoice.AIShipToAddressCustomer?.value > 0) {
            console.log("Adding AIShipToAddressCustomer");
            shipToConfidence = 1;
        } else {
            console.log("No AIShipToAddressCustomer");
        }
        shipToConfidence *= shipToWeight;

        console.log("Confidence Scores: ", itemConfidenceAvg, soldToConfidence, shipToConfidence);
        const totalConfidenceAvg = itemConfidenceAvg + soldToConfidence + shipToConfidence;
        console.log("Total confidence average: ", totalConfidenceAvg * 100);

        invoice.ConfidenceAvg = {};
        invoice.ConfidenceAvg.value = (totalConfidenceAvg * 100).toFixed(1);

    } else {

        // Feb 6, 2025
        console.log("Items confidence average: ", (confidenceAvg / confidenceScores).toFixed(3) * 100);

        if (invoice.AISoldToAddressCustomer?.value > 0) {
            console.log("Adding AISoldToAddressCustomer");
            confidenceAvg += 1;
            confidenceScores++;
        } else {
            console.log("No AISoldToAddressCustomer");
            confidenceAvg += 0;
            confidenceScores++;
        }

        if (invoice.AIShipToAddressCustomer?.value > 0) {
            console.log("Adding AIShipToAddressCustomer");
            confidenceAvg += 1;
            confidenceScores++;
        } else {
            console.log("No AIShipToAddressCustomer");
            confidenceAvg += 0;
            confidenceScores++;
        }

        invoice.ConfidenceAvg = {};
        // invoice.ConfidenceAvg.value = "0.700"
        invoice.ConfidenceAvg.value = (confidenceAvg / confidenceScores).toFixed(3) * 100;

    }

    console.log("Before final materials", JSON.stringify(invoice.Items))

    console.time("Final Materials Check Time");
    const fastestMaterialsResponse = await Promise.race([
        finalMaterialsCheckOpenAI(invoice.Items, "ordervision", apiKey),
        // finalMaterialsCheckOpenAI(invoice.Items, "bio-sf-ai", apiKey)
    ]);
    console.timeEnd("Final Materials Check Time");

    console.log("Fastest Materials Response:", JSON.stringify(fastestMaterialsResponse));

    if (fastestMaterialsResponse?.materials) {
        // Update materials array with the results from finalMaterialsCheckOpenAI
        materials.length = 0; // Clear existing materials
        materials.push(...fastestMaterialsResponse.materials);
    }

    invoice.Items = fastestMaterialsResponse || invoice.Items;

    // Write processed.json to S3
    // Write processed.json to S3
    if (event.timestamp) {
        const processedFileKey = `uploads/${event.timestamp}/processed.json`;
        invoice.Email = event.metadata;
        // Add base64 PDF content to each file in the attachments array
        if (invoice.Email?.Attachments) {
            invoice.Email.Attachments = await Promise.all(
                invoice.Email.Attachments.map(async (attachment) => {
                    try {
                        const attachmentS3Key = `uploads/${event.timestamp}/${attachment.AttachmentName}`;
                        const getCommand = new GetObjectCommand({
                            Bucket: BUCKET_NAME,
                            Key: attachmentS3Key
                        });
                        const response = await s3Client.send(getCommand);
                        const attachmentPDF = await response.Body.transformToString('base64');

                        return {
                            ...attachment,
                            PDF: attachmentPDF
                        };
                    } catch (error) {
                        console.error(`Error getting attachment ${attachment.AttachmentName} from S3:`, error);
                        return {
                            ...attachment,
                            PDF: null // or empty string if preferred
                        };
                    }
                })
            );
        }
        try {
            const putCommand = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: processedFileKey,
                Body: JSON.stringify(invoice),
                ContentType: 'application/json',
                // Tagging: 'AllowDelete=true'
            });
            await s3Client.send(putCommand);
            console.log(`Created processed.json file in /uploads/${event.timestamp}/`);
        } catch (error) {
            console.error('Error writing processed.json:', error);
            await sendAlert({
                message: `Start processing failed: Unable to write processed.json. Timestamp: ${event.timestamp}, Error: ${error.message}`
            });
            throw error;
        }

        // Send to SAP PI API endpoint
        try {
            await sendToSAPPI(invoice);
            // Track SAP delivery completed
            await trackSAPDeliveryCompleted(event.timestamp, event.metadata);
        } catch (sapError) {
            console.error('SAP delivery failed:', sapError);
            // Track SAP delivery failed
            await trackSAPDeliveryFailed(event.timestamp, event.metadata, sapError.message);
            // Don't throw error to avoid breaking the main flow
        }

        // Delete the processing.txt file
        const processingFileKey = `uploads/${event.timestamp}/processing.txt`;
        await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: processingFileKey }));
        console.log(`Deleted JSON file: ${processingFileKey}`);
        
        // Track processing completed
        await trackProcessingCompleted(event.timestamp, event.metadata, invoice);
    }

    return invoice;
}

/**
 * Get paragraphs from the data.
 * @param {Array} data - Data array.
 * @returns {Array} Array of paragraphs.
 */
function getParagraphs(data) {
    let paragraphs = [];
    data.forEach(paragraph => {
        paragraphs.push(paragraph.content);
    });
    return paragraphs;
}


/**
 * Extracts key-value pairs from an array of data objects.
 *
 * @param {Array<Object>} data - An array of objects containing `key` and `value` properties.
 * @param {Object} data[].key - The key object containing a `content` property.
 * @param {Object} data[].value - The value object containing a `content` property.
 * @returns {Array<Object>} An array of key-value pair objects with `key` and `value` properties.
 * Each key-value pair object contains:
 * - `key` (string): The trimmed content of the key.
 * - `value` (string): The trimmed content of the value.
 */
function getKeyValuePairs(data) {
    let keyValuePairs = [];
    data.forEach(item => {
        if (item.key && item.value) {
            keyValuePairs.push({
                key: item.key.content.trim(),
                value: item.value.content.trim(),
                // confidence: item.confidence || null,
                // boundingRegions: {
                //     key: item.key.boundingRegions || [],
                //     value: item.value.boundingRegions || []
                // }
            });
        }
    });
    return keyValuePairs;
}

/**
 * Create tables from the given data.
 * @param {Array} tables - Array of tables.
 * @returns {Array} Array of formatted tables.
 */
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

/**
 * Convert snake_case string to PascalCase.
 * @param {string} snakeCaseString - Snake case string.
 * @returns {string} Pascal case string.
 */
function convertSnakeToPascal(snakeCaseString) {
    return snakeCaseString.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
}

/**
 * Create variables from JSON object and update result documents.
 * @param {Object} jsonObject - JSON object.
 * @param {Object} resultDocuments - Result documents object.
 * @returns {Object} Updated result documents and created variables.
 */
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

/**
 * Get direct content values from the data.
 * @param {Object|Array} data - Data object or array.
 * @returns {Array} Array of content values.
 */
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

async function sendToSAPPI(invoice) {
    var envParams = {
        dev: { // E2D
            secretID: 'purchaseOrderConfirmation',
            host: '10.240.85.61',
            port: 50100,
        },
        e2q: { // E2Q
            secretID: 'purchaseOrderConfirmationQA4Q',
            host: 'brsapp4q.global.bio-rad.com', // qasp4qap00.global.bio-rad.com, 10.240.100.96, 50000
            port: 80,
        },
        qa: { // E3Q
            secretID: 'purchaseOrderConfirmationQA',
            host: 'brsapp3q.global.bio-rad.com',
            port: 80,
        },
        prod: {
            secretID: 'purchaseOrderConfirmationProdSec',
            host: 'brsapp1p.global.bio-rad.com',
            port: 80,
        }
    };
    const sapENV = process.env.SAP_ENV || 'dev'; // Default to 'dev' if not set
    var env = envParams[sapENV];

    const client = new SecretsManagerClient();
    const input = {
        SecretId: env.secretID
    };
    const command = new GetSecretValueCommand(input);
    const response = await client.send(command);

    if (response) {
        console.log(response);
        const secret = JSON.parse(response.SecretString)["purchaseOrderConfirmation"];

        var options = {
            host: env.host,
            port: env.port,
            path: '/RESTAdapter/AWS/OrderVision',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': secret
            }
        };

        try {
            const body = await new Promise((resolve, reject) => {
                const req = http.request(options, (res) => {
                    console.log('Status:', res.statusCode);
                    console.log('Headers:', res.headers);

                    let body = '';
                    res.on('data', (chunk) => body += chunk);
                    res.on('end', () => resolve(body));
                });

                req.on('error', reject);
                req.write(JSON.stringify(invoice));
                req.end();
            });

            console.log("SAP PI API Response:", body);

        } catch (error) {
            console.error('Request failed:', error);
            throw new Error('Error making HTTP request');
        }
    } else {
        let response = {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json"
            },
            isBase64Encoded: false,
            body: "Please contact your bio-rad representative. Error code: SV",
        };
        callback(null, response);
    }
}

/* handler function
    input: event, context, callback
    output: response
*/
/**
 * Handler function to process the event.
 * @param {Object} event - Event object.
 * @param {Object} context - Context object.
 * @returns {Object} Response object.
 */
export const handler = async (event, context) => {
    try {
        // if (AWS) {
        //     console.time("auth");
        //     await invokeAuth(event); // No need for a nested try-catch
        //     console.timeEnd("auth");
        //     console.log("Authorization executed successfully");
        // }

        console.time("run time");
        const response = await main(event);
        console.timeEnd("run time");

        return response; // Return the response from main directly
    } catch (error) {
        console.error("An error occurred:", error);
        
        // Track processing failed
        await trackProcessingFailed(event.timestamp || Date.now(), event.metadata || {}, error.message);
        
        // Send alert for processing failure
        await sendAlert({
            message: `Start processing failed: ${error.message}. Timestamp: ${event.timestamp || 'Unknown'}`
        });
        
        // Write failed.txt to S3 if we have a timestamp
        if (event.timestamp) {
            const failedFileKey = `uploads/${event.timestamp}/failed.txt`;
            try {
                const putCommand = new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: failedFileKey,
                    Body: error.message || 'Processing failed',
                    ContentType: 'text/plain',
                    Tagging: 'AllowDelete=true'
                });
                await s3Client.send(putCommand);
                console.log(`Created failed.txt file in /uploads/${event.timestamp}/`);

                const processingFileKey = `uploads/${event.timestamp}/processing.txt`;
                await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: processingFileKey }));
                console.log(`Deleted JSON file: ${processingFileKey}`);
            } catch (writeError) {
                console.error('Error writing failed.txt:', writeError);
            }
        }

        return {
            statusCode: error.statusCode || 500, // Default to 500 if statusCode is not provided
            body: JSON.stringify({ message: error.message }), // Ensure it's wrapped in an object
        };
    }
};

if (!AWS) {
    handler();
}
