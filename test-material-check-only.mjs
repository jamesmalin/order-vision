import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
// import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import DocumentIntelligence, { getLongRunningPoller, isUnexpected } from "@azure-rest/ai-document-intelligence";
import fs from "fs";
import OpenAI from 'openai';
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


/* Open AI Schemas */
// Define the full schema
const FullResponseSchema = z.object({
    materials: z.array(
        z.object({
            index: z.number(),
            materialNumbers: z.array(z.string()),
            productName: z.string(),
        })
    )
});
/* Open AI Schemas */


/**
 * Fetch materials from OpenAI based on the given prompt.
 * @param {string} prompt - Prompt to send to OpenAI.
 * @returns {Object} AI response object.
 */
async function fetchMaterialsFromOpenAI(prompt) {
    console.log(prompt);
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
        const model = 'sf-ai';
        const apiVersion = '2023-07-01-preview';
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

### Extraction Guidelines
1. Material Numbers: Use the header row to help identify the column for material numbers. When recording the index for each row, subtract 1 to exclude the header row from the count. Index starts at 0 without the header.
    - Extract all possible material numbers (alphanumeric patterns) from the data, ensuring that:
        - The results are formatted as arrays of arrays, where each sub-array corresponds to one row of data.
        - Material numbers may appear in any field, including descriptions, and there could be multiple matches within a single row.
        - Use regular expressions to identify material numbers, capturing patterns such as alphanumeric strings with or without hyphens (e.g., LS-041, C-310-5).
        - If the header does not explicitly label a column as "Material," include matches from all potential columns.
        - Also extract the product name from the description and include it in the response.

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

        // const completion = await openai.beta.chat.completions.parse({
        //     model: "gpt-4o",
        //     messages: [
        //         { role: "system", content: instructions },
        //         { role: "user", content: prompt },
        //     ],
        //     response_format: zodResponseFormat(FullResponseSchema, "response"),
        // });
        
        // // AI is bad at translating, so don't ask it to translate. If anything we can send to a translation service.
        // // Also, it should test both. Keep the address in chinese and also translate it to english to see which one is a better match.
        // const openAIPrice = priceCalculator.calculateTokenPrice(aiModel, completion.usage);
        // console.log("openAIPrice: ", openAIPrice);
        // const aiResponse = completion.choices[0].message.parsed;
        // return aiResponse;

    } catch (e) {
        console.log("Error getting AI response: ", e);
    }
}

const invoiceContent = [{"index":0,"content":["210,000.00","30-NOV-24","BW001\n397 Liquichek Urine Chemistry Control, Level 1\nSupplier must provide Certificate of Analysis or other\nCertificate certifying date of manufacture with every\nshipment or every lot. Such documents must be\nincluded in the goods upon receipt at Buyer's delivery\naddress or sent to the buyer in advance with\nmatching part purchase order and shipment dates.","50EA","4200"]},{"index":1,"content":["210,000.00","30-NOV-24","BW002\n398 Liquichek Urine Chemistry Control, Level 2\nSupplier must provide Certificate of Analysis or other\nCertificate certifying date of manufacture with every\nshipment or every lot. Such documents must be\nincluded in the goods upon receipt at Buyer's delivery\naddress or sent to the buyer in advance with\nmatching part purchase order and shipment dates.","50EA","4200"]},{"index":2,"content":["288,000.00","30-NOV-24","A36987\n370 Lyphochek Immunoassay Plus Control, Trilevel\nSupplier must provide Certificate of Analysis or other\nCertificate certifying date of manufacture with every\nshipment or every lot. Such documents must be\nincluded in the goods upon receipt at Buyer's delivery","60EA","4800"]},{"index":3,"content":["270,000.00","30-NOV-24","C25704\n545 Liquichek Ethanol/Ammonia Control, Level 2 6x3 mL","90EA","3000"]},{"index":4,"content":["270,000.00","30-NOV-24","C25703\n544 Liquichek Ethanol/Ammonia Control, Level 1 6x3 mL","90EA","3000"]},{"index":5,"content":["150,000.00","30-NOV-24","A96328\n367 Lyphochek Tumor Marker Plus Control, Level 1\nSupplier must provide Certificate of Analysis or other\nCertificate certifying date of manufacture with every\nshipment or every lot. Such documents must be\nincluded in the goods upon receipt at Buyer's delivery\naddress or sent to the buyer in advance with\nmatching part purchase order and shipment dates.","30EA","5000"]},{"index":6,"content":["150,000.00","30-NOV-24","Address at top of page\nA96329\n368 Lyphochek Tumor Marker Plus Control, Level 2\nSupplier must provide Certificate of Analysis or other\nCertificate certifying date of manufacture with every\nshipment or every lot. Such documents must be\nincluded in the goods upon receipt at Buyer's delivery\naddress or sent to the buyer in advance with\nmatching part purchase order and shipment dates.","30EA","5000"]}];
const openAIMaterialsResponse = await fetchMaterialsFromOpenAI(JSON.stringify(invoiceContent));
console.log("OpenAI Materials Response: ", JSON.stringify(openAIMaterialsResponse, null, 2));