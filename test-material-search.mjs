import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
// import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import DocumentIntelligence, { getLongRunningPoller, isUnexpected } from "@azure-rest/ai-document-intelligence";
import fs from "fs";
import OpenAI from 'openai';
import { Pinecone } from "@pinecone-database/pinecone";
import axios, { all } from 'axios';
import dotenv from 'dotenv';
dotenv.config();

import { searchMaterial } from "./search-material.mjs";

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

const material_pinecone_api_key = process.env.PINECONE_PROD_API_KEY; // MATERIAL_PINECONE_API_KEY
const materialVectorIndexName = 'materials'; // sf-ai
const materialPineconeInitialization = await initializePinecone(material_pinecone_api_key, materialVectorIndexName);

async function initializePinecone(pineconeApiKey, indexName) {
    const pinecone = new Pinecone({
        apiKey: pineconeApiKey
    });
    const index = pinecone.index(indexName);
    console.log("Pinecone client and index initialized");
    return index;
}
let materialai, itemMaterial, description;

// Test the new functionality with Bio-Rad prefix
itemMaterial = ["004214V"];
// description = `"60,928.00","01.07.2025","4000000227\nD10 HBA1C 400T\n#2200101/12000949\nREORDER PACK-BIORAD","38220090","2","12.00","PAC","27,200.00"`;
const country = null;

materialai = await searchMaterial(materialPineconeInitialization, embeddingOpenAI, itemMaterial, description, false, country);
console.log("Material AI: ", materialai);

// // Test with just the numeric part for comparison
// itemMaterial = [];
// description = `COT000392\nBiorad_Urinalysis Control Level-\n38220090_12\n1.0\npacket\n12.0\n15150.0\n15150\n0.0\n0.0\n0.0\n0.0\n12.0\n1818.0\n16968.0\n1_12x12ml_436`;

// materialai = await searchMaterial(materialPineconeInitialization, embeddingOpenAI, itemMaterial, description, false, country);
// console.log("Material AI: ", materialai);

// itemMaterial = [
//     "BW002", 
//     "398"
// ];
// description = `Liquichek Urine Chemistry Control, Level 2
// Supplier must provide Certificate of Analysis or other
// Certificate certifying date of manufacture with every
// shipment or every lot. Such documents must be
// included in the goods upon receipt at Buyer's delivery
// address or sent to the buyer in advance with
// matching part purchase order and shipment dates.`;

// materialai = await searchMaterial(materialPineconeInitialization, itemMaterial, description);
// console.log("Material AI: ", materialai);

// itemMaterial = [];
// description = `A36987
// 370 Lyphochek Immunoassay Plus Control, Trilevel
// Supplier must provide Certificate of Analysis or other
// Certificate certifying date of manufacture with every
// shipment or every lot. Such documents must be
// included in the goods upon receipt at Buyer's delivery`;

// materialai = await searchMaterial(materialPineconeInitialization, itemMaterial, description);
// console.log("Material AI: ", materialai);
