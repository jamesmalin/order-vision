import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
// import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import DocumentIntelligence, { getLongRunningPoller, isUnexpected } from "@azure-rest/ai-document-intelligence";
import fs from "fs";
import OpenAI from 'openai';
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import dotenv from 'dotenv';
dotenv.config();

const AWS = process.env.AWS === 'true';
const BUCKET_NAME = 'order-vision-ai-dev';
const REGION = 'us-east-2';
const s3Client = new S3Client({ region: REGION });
const Azure = process.env.AZURE === 'true';

const pinecone_env = process.env.PINECONE_ENVIRONMENT || 'DEV';

// Will be initialized in main() after getting the API key
let embeddingOpenAI;
// const embeddingResource = 'bio-sf-ai';
const embeddingResource = 'order-vision-ai';
// const embeddingAPIVersion = '2023-07-01-preview';
const embeddingAPIVersion = '2024-12-01-preview';
const embeddingModel = 'text-embedding-3-small';

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

// Define the full schema
const ClassificationResponseSchema = z.object({
    classification: z.enum(["Purchase Order", "Quote", "Supporting Document", "Customer Inquiry"]),
    customer_inquiry: z.object({
        is_customer_inquiry: z.boolean(),
        quote: z.string().optional(),
        purchase_order: z.string().optional(),
        questions: z.array(z.string()).optional()
    })
});

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
                base64Source: PDF
            },
            queryParameters: {
                features: ["KeyValuePairs"],
                // locale: "en-US", 
                pages: "1"
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
 * Fetch data from OpenAI based on the given prompt.
 * @param {string} prompt - Prompt to send to OpenAI.
 * @returns {Object} AI response object.
 */
async function fetchClassificationFromOpenAI(prompt, apiKey) {
    try {

        const resource = 'order-vision-ai';
        // const apiVersion = '2024-08-01-preview';
        const model = (pinecone_env === "PROD") ? "gpt-4o" : "gpt-4o-test";
        // const model = (pinecone_env === "PROD") ? "o3-mini-3" : "o3-mini-test-3";
        const apiVersion = '2024-12-01-preview';

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

## Classification
- Classify the document into one of the following categories:
1. Purchase Order
2. Quote
3. Supporting Document (Any other document that is not a Purchase Order, Quote, or Customer Inquiry)
4. Customer Inquiry (This is normally in the form of an email message)

### Customer Inquiry
- If the document is a Customer Inquiry, provide a response to the customer inquiry in the format below:
{
    "is_customer_inquiry": <true or false>,
    "quote": "<quote number>",
    "purchase_order": "<purchase order number>",
    "questions": ["<question 1>", "<question 2>"]
}
- If the document is not a Customer Inquiry, return empty values.

## Response Format
Use this JSON structure:
{
    "classification": "<category>",
    "customer_inquiry": {
        "is_customer_inquiry": true,
        "quote": "<quote number>",
        "purchase_order": "<purchase order number>",
        "questions": ["<question 1>", "<question 2>"]
    }
}`;

        const response = await openai.chat.completions.create({
            // model: aiModel,
            messages: [
                { role: "system", content: instructions },
                { role: "user", content: prompt }
            ],
            // temperature: 0,
            // response_format: { type: 'json_object' }
            response_format: zodResponseFormat(ClassificationResponseSchema, "response"),
        });

        const aiResponse = response.choices[0].message.content.trim();
        return JSON.parse(aiResponse);

    } catch (e) {
        console.log("Error getting AI response: ", e);
    }
}

/**
 * Main function to process the event.
 * @param {Object} event - Event object.
 * @param {Function} callback - Callback function.
 * @returns {Object} Response object.
 */
async function main(event, callback) {
    // console.log("Event received:", JSON.stringify(event));

    // Get OpenAI API key once at the start
    const apiKey = await getOpenAIKey();
    
    const classification = await fetchClassificationFromOpenAI("What is that status on PO 12345? Do you have enough in stock for our July 10 delivery?", apiKey);

    console.log("Classification result:", classification);
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
        // Write failed.txt to S3 if we have a timestamp
        if (event.timestamp) {
            const failedFileKey = `uploads/${event.timestamp}/classification-failed.txt`;
            try {
                const putCommand = new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: failedFileKey,
                    Body: error.message || 'Classification failed',
                    ContentType: 'text/plain',
                    Tagging: 'AllowDelete=true'
                });
                await s3Client.send(putCommand);
                console.log(`Created file ${failedFileKey} with error message`);

                // const processingFileKey = `uploads/${event.timestamp}/classification-processing.txt`;
                // await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: processingFileKey }));
                // console.log(`Deleted file: ${processingFileKey}`);
            } catch (writeError) {
                console.error(`Error writing ${failedFileKey}`, writeError);
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
