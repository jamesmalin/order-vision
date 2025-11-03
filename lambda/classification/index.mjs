import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
// import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import DocumentIntelligence, { getLongRunningPoller, isUnexpected } from "@azure-rest/ai-document-intelligence";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { trackClassificationCompleted, trackClassificationFailed, trackProcessingStarted } from './tracking-utils.mjs';
import fs from "fs";
import OpenAI from 'openai';
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { findRRC } from "./rrc-number.mjs";
import dotenv from 'dotenv';
dotenv.config();

const AWS = process.env.AWS === 'true';
const BUCKET_NAME = process.env.BUCKET_NAME || 'order-vision-ai-dev';
const REGION = process.env.AWS_LAMBDA_REGION || 'us-east-2';
const s3Client = new S3Client({ region: REGION });
const lambdaClient = new LambdaClient({ region: REGION });
const Azure = process.env.AZURE === 'true';
const LAMBDA_FUNCTION_NAME = 'order-vision-start-processing';

// Function to send alert to CloudWatch alerts Lambda using direct Lambda invocation
async function sendAlert(alertData) {
  const environment = process.env.ENVIRONMENT || 'Development';
  
  const payload = {
    lambda: 'Order Vision Classification',
    environment: environment,
    alertType: 'manual',
    alarmName: 'Classification Error',
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

const parserEndpoint = process.env[`AZURE_INVOICE_PARSER_ENDPOINT_${pinecone_env}`];
const parserKey = process.env[`AZURE_INVOICE_PARSER_KEY_${pinecone_env}`];

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
 * @param {number} minPage - Optional minimum page number (default: 1).
 * @param {number} maxPage - Optional maximum page number (default: undefined, processes all pages).
 * @returns {Object} Result of the processing.
 */
async function azureProcessing(PDF, model, minPage = 1, maxPage = undefined) {
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
    
    // Build pages parameter based on minPage and maxPage
    let pagesParam = "1"; // default to page 1 only
    if (maxPage !== undefined) {
        // Process specific page range
        pagesParam = `${minPage}-${maxPage}`;
    } else if (minPage > 1) {
        // Process single specific page
        pagesParam = `${minPage}`;
    }
    // Note: Azure Document Intelligence interprets single page number as just that page
    // and page ranges (e.g., "2-5") as the specified range
    
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
                pages: pagesParam
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
 * @param {string} apiKey - OpenAI API key.
 * @param {string} filename - Name of the file being processed.
 * @returns {Object} AI response object.
 */
async function fetchClassificationFromOpenAI(prompt, apiKey, filename) {
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

Filename: ${filename}

## Filename

### "MailPdf"
If the filename contains "MailPdf":
- It is likely a Supporting Document.
- Only if it contains actual tables or line items, then it could be a Purchase Order.
- If it contains a Quote number, it is likely a Quote.
- If it is asking questions, and it is not any of the above, then it is likely a Customer Inquiry.

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
    console.log("Event received:", JSON.stringify(event));

    // Get OpenAI API key once at the start
    const apiKey = await getOpenAIKey();
    
    // Initialize embeddingOpenAI with the same API key
    embeddingOpenAI = new OpenAI({
        apiKey: apiKey,
        baseURL: `https://${embeddingResource}.openai.azure.com/openai/deployments/${embeddingModel}`,
        defaultQuery: { 'api-version': embeddingAPIVersion },
        defaultHeaders: { 'api-key': apiKey },
    });

    // Check for at least one attachment in metadata
    if (!event.metadata?.Attachments?.[0]) {
        const errorMsg = "No attachments found in metadata";
        await sendAlert({
            message: `Classification failed: ${errorMsg}. Timestamp: ${event.timestamp || 'Unknown'}`
        });
        throw new Error(errorMsg);
    }

    let purchaseOrderAttachment;
    let customerInquiry, customerInquiryResult;

    // Process each attachment
    for (const attachment of event.metadata.Attachments) {
        const attachmentName = attachment.AttachmentName;
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
                message: `Classification failed: Unable to retrieve file ${attachmentName} from S3. Timestamp: ${event.timestamp}, Error: ${error.message}`
            });
            throw new Error(`Failed to get file ${attachmentName} from S3: ${error.message}`);
        }

        if (!PDF) {
            const errorMsg = "No PDF content received from S3";
            await sendAlert({
                message: `Classification failed: ${errorMsg}. File: ${attachmentName}, Timestamp: ${event.timestamp}`
            });
            throw new Error(errorMsg);
        }

        console.log(`Processing attachment: ${attachmentName}`);

        let resultLayout = await azureProcessing(PDF, "prebuilt-layout");
        let pageCount;
        if (resultLayout) {
            pageCount = resultLayout.pages.length;
            console.log(`resultLayout for: ${attachmentName}`, JSON.stringify(resultLayout, null, 2));
            const classification = await fetchClassificationFromOpenAI(JSON.stringify(resultLayout.content), apiKey, attachmentName);
            console.log(`Classification for: ${attachmentName}`, JSON.stringify(classification, null, 2));
            
            // Update the attachment with the classification
            attachment.Type = classification.classification;
        }

        if (attachment.Type === "Purchase Order") {
            purchaseOrderAttachment = attachment.AttachmentName;
            console.log(`Purchase Order found: ${attachmentName}`);
        }

        if (attachment.Type === "Customer Inquiry") {
            customerInquiry = attachment.AttachmentName;
            customerInquiryResult = resultLayout; // only page 1 -- need to check if there are more pages
            console.log(`Customer Inquiry found: ${attachmentName}`);
        }

        if (attachment.Type === "Supporting Document") {
            console.log(`Supporting Document found: ${attachmentName}`);
        }

        // Find RRC number in MailPdf files (regardless of attachment type)
        if (attachmentName.startsWith("MailPdf")) {
            const rrcNumbers = findRRC(resultLayout.content);
            if (rrcNumbers.length > 0) {
                console.log(`RRC numbers found in MailPdf file: ${rrcNumbers.join(', ')}`);
                attachment.RRC = rrcNumbers;
            }
        }
    }

    // Process additional pages for any MailPdf files if needed
    const mailPdfFiles = event.metadata.Attachments.filter(att => att.AttachmentName.startsWith("MailPdf"));
    for (const mailPdfFile of mailPdfFiles) {
        const s3Key = `uploads/${event.timestamp}/${mailPdfFile.AttachmentName}`;
        
        try {
            const getCommand = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: s3Key
            });
            const response = await s3Client.send(getCommand);
            const PDF = await response.Body.transformToString('base64');
            
            // Get page count by processing with layout model
            const layoutResult = await azureProcessing(PDF, "prebuilt-layout");
            const pageCount = layoutResult?.pages?.length || 1;
            
            if (pageCount > 1) {
                console.warn(`MailPdf file ${mailPdfFile.AttachmentName} has multiple pages (${pageCount}). Processing additional pages.`);
                
                // Process pages 2 through pageCount
                const additionalPagesResult = await azureProcessing(PDF, "prebuilt-layout", 2, pageCount);
                
                if (additionalPagesResult) {
                    console.log(`Processed additional pages 2-${pageCount} for MailPdf file`);
                    
                    // Find RRC numbers in additional pages
                    const additionalRrcNumbers = findRRC(additionalPagesResult.content);
                    if (additionalRrcNumbers.length > 0) {
                        console.log(`Additional RRC numbers found in MailPdf pages 2-${pageCount}: ${additionalRrcNumbers.join(', ')}`);
                        
                        // Merge with existing RRC numbers
                        const existingRrc = mailPdfFile.RRC || [];
                        const allRrcNumbers = [...new Set([...existingRrc, ...additionalRrcNumbers])];
                        mailPdfFile.RRC = allRrcNumbers;
                        
                        console.log(`All RRC numbers found in MailPdf file: ${allRrcNumbers.join(', ')}`);
                    }
                }
            }
        } catch (error) {
            console.error(`Error processing additional pages for MailPdf file ${mailPdfFile.AttachmentName}:`, error);
        }
    }

    // Track classification completed
    await trackClassificationCompleted(event.timestamp, event.metadata, event);

    // Check if a purchase order was found
    if (purchaseOrderAttachment) {
        // Process purchase order
        console.log(`Processing Purchase Order: ${purchaseOrderAttachment}`);
        
        // Track processing started
        await trackProcessingStarted(event.timestamp, event.metadata);
        
        // Collect all RRC numbers from customer inquiry and supporting document attachments
        const allRrcNumbers = [];
        event.metadata.Attachments.forEach(attachment => {
            if ((attachment.Type === "Customer Inquiry" || attachment.Type === "Supporting Document") && attachment.RRC) {
                allRrcNumbers.push(...attachment.RRC);
            }
        });
        
        // Add RRC numbers to the event payload if any were found
        if (allRrcNumbers.length > 0) {
            // Deduplicate RRC numbers
            const uniqueRrcNumbers = [...new Set(allRrcNumbers)];
            event.RRC = uniqueRrcNumbers;
            console.log(`Adding RRC numbers to purchase order processing: ${uniqueRrcNumbers.join(', ')}`);
        }
        
        console.log(JSON.stringify(event));

        // Invoke Lambda asynchronously with retry mechanism
        const invokeCommand = new InvokeCommand({
            FunctionName: LAMBDA_FUNCTION_NAME,
            Payload: Buffer.from(JSON.stringify(event)),
            InvocationType: 'Event'  // Async invocation
        });
        
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const resp = await lambdaClient.send(invokeCommand);
                console.log(`Async invoke succeeded on attempt ${attempt}`, resp);
                break;
            } catch (err) {
                console.warn(`Invoke attempt ${attempt} failed:`, err);
                if (attempt === maxRetries) {
                    console.error('All retries failed');
                    await sendAlert({
                        message: `Classification failed: Unable to invoke ${LAMBDA_FUNCTION_NAME} after ${maxRetries} attempts. Timestamp: ${event.timestamp}, Error: ${err.message}`
                    });
                    throw err;
                }
                // optional: await new Promise(r => setTimeout(r, 100 * attempt));
            }
        }
    }

    // Write classification.json to S3
    if (event.timestamp) {
        const classificationFileKey = `uploads/${event.timestamp}/classification.json`;
        try {
            const putCommand = new PutObjectCommand({
                Bucket: BUCKET_NAME,
                Key: classificationFileKey,
                Body: JSON.stringify(event),
                ContentType: 'application/json',
                // Tagging: 'AllowDelete=true'
            });
            await s3Client.send(putCommand);
            console.log(`Created classification.json file in /uploads/${event.timestamp}/`);
        } catch (error) {
            console.error('Error writing classification.json:', error);
            await sendAlert({
                message: `Classification failed: Unable to write classification.json. Timestamp: ${event.timestamp}, Error: ${error.message}`
            });
            throw error;
        }
    }

    return event;
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
        
        // Track classification failed
        if (event.timestamp && event.metadata) {
            await trackClassificationFailed(event.timestamp, event.metadata, error.message);
        }
        
        // Send alert for classification failure
        await sendAlert({
            message: `Classification processing failed: ${error.message}. Timestamp: ${event.timestamp || 'Unknown'}`
        });
        
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
