import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
// import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import DocumentIntelligence, { getLongRunningPoller, isUnexpected } from "@azure-rest/ai-document-intelligence";
import fs from "fs";
import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

import PriceCalculator from 'ai-calc';
const priceCalculator = new PriceCalculator();
const aiModel = "gpt-4-1106-preview"; // gpt-4-1106-preview, gpt-4o, o1-mini

const AWS = process.env.AWS === 'true';
const Azure = process.env.AZURE === 'true';

async function fetchAddressFromOpenAI(prompt) {
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

### Response Format
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

const promptContent = {
    "CustomerAddress": {
      "type": "address",
      "content": "台北市松山區南京東路四段126號14樓B室",
      "valueAddress": {
        "houseNumber": "126號",
        "road": "南京東路四段",
        "city": "台北市松山區",
        "streetAddress": "126號 南京東路四段 B室",
        "unit": "B室",
        "level": "14樓"
      }
    },
    "CustomerAddressRecipient": {
      "type": "string",
      "valueString": "美商伯瑞股份有限公司台灣分公司",
      "content": "美商伯瑞股份有限公司台灣分公司"
    },
    "CustomerName": {
      "type": "string",
      "valueString": "美商伯瑞股份有限公司台灣分公司",
      "content": "美商伯瑞股份有限公司台灣分公司"
    },
    "VendorAddress": {
      "type": "address",
      "content": "台中市協和里西屯區工業區40路61-1號\nNo. 61-1, 40th Rd., Taichung Industrial Park,\nTaichung City, Taiwan 40768",
      "valueAddress": {
        "houseNumber": "61-1號\nNo. 61-1",
        "road": "工業區40路",
        "postalCode": "40768",
        "city": "台中市協和里",
        "countryRegion": "Taiwan",
        "streetAddress": "61-1號\nNo. 61-1 工業區40路",
        "cityDistrict": "西屯區"
      }
    },
    "VendorAddressRecipient": {
      "type": "string",
      "valueString": "瑩芳有限公",
      "content": "瑩芳有限公"
    },
    "VendorName": {
      "type": "string",
      "valueString": "瑩芳有限公司\nIn Fung Co., Ltd.",
      "content": "瑩芳有限公司\nIn Fung Co., Ltd."
    }
};

let addressResponse = await fetchAddressFromOpenAI(JSON.stringify(promptContent));
console.log("Address Response: ", JSON.stringify(addressResponse, null, 2));