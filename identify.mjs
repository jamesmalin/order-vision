import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
// import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import DocumentIntelligence, { getLongRunningPoller, isUnexpected } from "@azure-rest/ai-document-intelligence";
import fs from "fs";
import OpenAI from 'openai';
import { Pinecone } from "@pinecone-database/pinecone";
import axios, { all } from 'axios';
import dotenv from 'dotenv';
dotenv.config();

import PriceCalculator from 'ai-calc';
const priceCalculator = new PriceCalculator();
const aiModel = "gpt-4-1106-preview"; // gpt-4-1106-preview, gpt-4o, o1-mini

const AWS = process.env.AWS === 'true';
const Azure = process.env.AZURE === 'true';

const pinecone_api_key = process.env.PINECONE_API_KEY;
const vectorIndexName = 'addresses';
const vectorNamespace = process.env.NAMESPACE || "address_v3_adrc"; // address_default, addresses, name, name_address, address_v2, address_v3_adrc

const nameArray = [];

async function azureProcessing(PDF) {
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

    const modelId = process.env.DOCUMENT_INTELLIGENCE_CUSTOM_MODEL_ID || "prebuilt-invoice"; // "prebuilt-layout";
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
function getDirectContentValues(data) {
    let contents = [];
    // Check if the data is an array and recursively extract content from each item
    if (Array.isArray(data)) {
        data.forEach(item => {
            if (item.type === 'object' && item.valueObject) {
                contents = contents.concat(getDirectContentValues(item.valueObject));
            } else if (item.type === 'array' && item.valueArray) {
                contents = contents.concat(getDirectContentValues(item.valueArray));
            } else if (item.hasOwnProperty('content')) {
                contents.push(item.content);
            }
        });
    } else if (typeof data === 'object' && data !== null) {
        // If data is an object, iterate over its properties
        for (let key in data) {
            if (data[key] && typeof data[key] === 'object') {
                // Recursively extract contents from nested objects
                contents = contents.concat(getDirectContentValues(data[key]));
            }
        }
    }
    return contents;
}

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
        const instructions = `# Instructions
Which is the sold to and which is the delivery address? If none for either one that is okay. Give me the reason for your response for each.

## Response
Use the following JSON object structure:
{
    "sold_to": "value",
    "sold_to_address": "value",
    "sold_to_reason": "value",
    "delivery_to": "value",
    "delivery_address": "value",
    "delivery_reason": "value"
}`;
    const response = await openai.chat.completions.create({
    model: aiModel,
    messages: [
        {"role": "system", "content": instructions},
        {"role": "assistant", "content": "You are a linguistic specialist. Always translate all JSON fields to English if in another language."},
        {"role": "user", "content": prompt}
    ],
    response_format: { type: 'json_object' }
    });
    const openAIPrice = priceCalculator.calculateTokenPrice(aiModel, response.usage);
    // console.log("openAIPrice: ", openAIPrice);
    const aiResponse = response.choices[0].message.content.trim();
    return aiResponse;
    } catch (e) {
      console.log("error getting image response: ", e);
    }
}

async function main() {
    const filePath = './PO samples from China/7900009394_english.pdf';
    // const filePath = '/Users/yoda/Downloads/1007742604~EN.pdf';
    // const PDF = fs.createReadStream(filePath);

    const PDF = await fs.promises.readFile(filePath, {encoding: 'base64'});
    
    // ai-document-intelligence
    // const filePath = '/Users/yoda/Downloads/79008271 伯瑞FOR元英 2.pdf';
    // PDF = await fs.promises.readFile(filePath, {encoding: 'base64'});

    if (!PDF) {
        console.log("No PDF received.");
        return {
            statusCode: 200,
            body: JSON.stringify("No PDF received."),
        };
    }

    let result = await azureProcessing(PDF);

    if (result) {
        console.log('full result:', JSON.stringify(result));
        let resultDocuments = result.documents[0];
        const invoice = resultDocuments.fields;
        const items = getDirectContentValues(invoice.Items);
        try {
            let finalTables = [];
            try {
                finalTables = await createTables(result.tables);
            } catch (e) {
                console.log("error forming tables: ", finalTables);
            }
            const content = `**Items**:\n${JSON.stringify(items)}\n\n**Tables**:\n${JSON.stringify(finalTables)}\n\n**Everything else**:\n${JSON.stringify(result.content)}`;
            // const content = `**Items**:\n${JSON.stringify(items)}\n\n**Tables**:\n${JSON.stringify(finalTables)}`;
            console.log("Content: ", content);
            const openAIResponse = await fetchDataFromOpenAI(content);
            console.log("OpenAI Response: ", openAIResponse);
        }
        catch (e) {
            console.log("Error in processing: ", e);
        }
    }
}

await main();