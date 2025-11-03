import { extractMaterials } from './extract-materials.mjs';
import OpenAI from 'openai';
import { Pinecone } from "@pinecone-database/pinecone";
import natural from 'natural';
import dotenv from 'dotenv';
dotenv.config();

import { searchMaterial } from "./search-material.mjs";

// const material_pinecone_api_key = process.env.MATERIAL_PINECONE_API_KEY;
// const materialVectorIndexName = 'sf-ai';
const material_pinecone_api_key = process.env.PINECONE_PROD_API_KEY;
const materialVectorIndexName = 'materials';
const namespace = 'materials-021125'; 
const resource = 'bio-sf-ai';
const materialPineconeInitialization = await initializePinecone(material_pinecone_api_key, materialVectorIndexName);

async function initializePinecone(pineconeApiKey, indexName) {
    const pinecone = new Pinecone({
        apiKey: pineconeApiKey
    });
    const index = pinecone.index(indexName);
    console.log("Pinecone client and index initialized");
    return index;
}

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

let materialai, itemMaterial, materialDescription, productName;

materialDescription = "268-0963\n361\n8\n12/Bx\n243.00\n1944.00\nIMMUNO ASSAY + 12X5 LEV 1 5ML\n** special contract price **";
// materialDescription = `配合交貨,待通
// 0001
// 68-041-002000
// 12/CA
// $410/CA
// 知
// /
// /
// 尿液生化品管血清 Ⅰ
// LIQUICHEK URINE CHEMISTRY CONTROL I
// 10ML/CA
// Bio-Rad/397
// -`;
itemMaterial = extractMaterials(materialDescription);
console.log(itemMaterial); // ["BW001", "397", "123", "456"]
productName = "liquichek urine chemistry control, level 2";
// console.log(result); // ["BW001", "397", "123", "456"]


// itemMaterial = [
//     "BW002", 
//     "398"
// ];
// materialDescription = `BW002\n398 Liquichek Urine Chemistry Control, Level 2
// Supplier must provide Certificate of Analysis or other
// Certificate certifying date of manufacture with every
// shipment or every lot. Such documents must be
// included in the goods upon receipt at Buyer's delivery
// address or sent to the buyer in advance with
// matching part purchase order and shipment dates.`;

materialai = await searchMaterial(materialPineconeInitialization, embeddingOpenAI, itemMaterial, materialDescription);
console.log("Material AI: ", materialai);

// let materialArray = [];
// await Promise.all(itemMaterial.map(async (element) => {
//     materialai = await searchMaterial(materialPineconeInitialization, element, materialDescription);
//     console.log("Material AI: ", materialai);
//     if (materialai && materialai.length > 0) {
//         materialArray.push(materialai);
//     }
// }));

// console.log("Material Array: ", materialArray);
// function tokenSetRatio(str1, str2) {
//     const set1 = new Set(str1.split(/\s+/));
//     const set2 = new Set(str2.split(/\s+/));

//     const intersection = [...set1].filter(token => set2.has(token));
//     const union = [...new Set([...set1, ...set2])];

//     return (2 * intersection.length) / union.length;
// }

// const description1 = "urine chemistry 2 liq 12x10ml";
// const description2 = "liquichek urine chemistry control, level 2";

// const similarity = tokenSetRatio(description1.toLowerCase(), description2.toLowerCase());
// console.log(`Token Set Ratio: ${similarity}`);

