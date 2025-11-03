import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import fs from "fs";
import OpenAI from "openai";
import dotenv from 'dotenv';
dotenv.config();

import { pdf } from 'pdf-to-img';

import PriceCalculator from 'ai-calc';
const priceCalculator = new PriceCalculator();
const aiModel = "gpt-4o-mini"; //gpt-4o-mini

const AWS = process.env.AWS === 'true';
const Azure = process.env.AZURE === 'true';
const saveImages = process.env.SAVE_IMAGES === 'true';

async function pdfToImages(pdfData) {
    const images = [];
    const maxPages = 99;
  
    try {
        const document = await pdf(pdfData, { scale: 3 });
        let pageCount = 0;

        if (saveImages) {
            const outputDir = "./test/";
            await fs.promises.mkdir(outputDir, { recursive: true });
        }

        for await (const imageBuffer of document) {
            if (pageCount >= maxPages) break;
            images.push(imageBuffer.toString('base64'));

            if (saveImages) {
                const filePath = path.join(outputDir, `page-${pageCount + 1}.png`);
                await fs.promises.writeFile(filePath, imageBuffer);
            }
            
            pageCount++;
        }
        
        return images;
    } catch (error) {
        console.error('Error converting PDF to images:', error);
        return [];
    }
}

async function generateImageBlocks(pdfData) {
    const base64Images = await pdfToImages(pdfData);
    let images = [];

    for (const imageBase64 of base64Images) {
        images.push({
            "type": "image_url",
            "image_url": {
                "url": `data:image/jpeg;base64,${imageBase64}`,
                "detail": "high"
            }
        });
    }

    return images;
}
  
async function fetchDataFromOpenAI(content, pdfData) {
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
        const images = await generateImageBlocks(pdfData);

        const instructions = `# Instructions
## Language Required
All fields should be translated to English if in another language.

## Extract the material number from each value in the array.
Example: ["1\n1250140\nAminex HPX-87H Column, 300 x 7.8 mm\n1\n38,370\n38,370\n正茂"]
Output: ["1250140"]

## Extract consignee name and address if available. If not available, use the shipping name and address.

## Extract the billing name and address.

## Extract the contact person.

## BIO-RAD is the vendor
Bio-Rad should never be referenced for any of the required fields. If it is, then you grabbed the wrong one.

## Response
Use the following JSON object structure and translate all fields to English if in another language:
{
    "materials": ["1234","5678"],
    "billing_name": "ACME Corp",
    "billing_address": "1234 Main St, Anytown, USA",
    "shipping_name": "ACME Corp",
    "shipping_address": "1234 Main St, Anytown, USA",
    "consignee_name": "ACME Corp",
    "consignee_address": "1234 Main St, Anytown, USA",
    "contact_person": "John Doe",
    "contact_email": "",
    "contact_phone_direct": "",
    "contact_phone_mobile": ""
}`;

    const response = await openai.chat.completions.create({
          messages: [
            //   {role: 'assistant', content: "You are a linguistic specialist. Always translate all JSON fields to English if in another language."},
              { role: 'user', content: [
                  {
                    "type": "text",
                    "text": "You are a linguistic specialist. Always translate all JSON fields to English if in another language."
                  },
                  {
                      "type": "text",
                      "text": instructions
                  },
                  {
                    "type": "text",
                    "text": `Content to use with images: ${JSON.stringify(content)}`
                  },
                  ...images
              ] },
          ],
          response_format: {
            type: 'json_object'
          },
          model: aiModel,
      });
      const AIVisionResponse = response.choices[0].message.content.trim();
    //   console.log("AI Vision Response: ", trimmedResponse);
      const AIVisionPrice = priceCalculator.calculateTokenPrice(aiModel, response.usage);
    //   console.log("AI Vision Cost: ", AIVisionPrice);
      return { AIVisionPrice, AIVisionResponse };
    } catch (e) {
      console.log("error getting image response: ", e);
    }
}

/* function to process invoice in Azure
    input: PDF
    output: result
*/
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
    const client = new DocumentAnalysisClient(endpoint, new AzureKeyCredential(key));
    
    // first 2 pages only
    const poller = await client.beginAnalyzeDocument("prebuilt-invoice", PDF, 
        {
            // pages:"1-2",
            features:["KeyValuePairs"],
            locale: "en-US"
        }
    );
    return await poller.pollUntilDone();
}

/* main function
    input: event, callback
    output: response
*/
async function main(event, callback) {
    let PDF = (event && event.body) ? event.body : false;
    const filePath = '/Users/yoda/Downloads/79008271 伯瑞FOR元英 2.pdf';
    if (AWS) {
        PDF = Buffer.from(PDF, "base64");
    } else {
        PDF = fs.createReadStream(filePath);
    }

    if (!PDF) {
        console.log("No PDF received.");
        return {
            statusCode: 200,
            body: JSON.stringify("No PDF received."),
        };
    }

    let result = await azureProcessing(PDF);

    if (result) {
        // console.log('full result:', JSON.stringify(result));
        let resultDocuments = result.documents[0];
        // resultDocuments.fields["AICurrencyCode"] = {
        //     "value": currencyCodeAI
        // }
        const invoice = resultDocuments.fields;
        const items = getDirectContentValues(invoice.Items);
        try {
            let finalTables = [];
            try {
                finalTables = await createTables(result.tables);
            } catch (e) {
                console.log("error forming tables: ", finalTables);
            }
            // console.log(JSON.stringify(finalTables));

            let AIVisionPrice, AIVisionResponse;
            try {
                const pdfData = await fs.promises.readFile(filePath);
                ({AIVisionPrice, AIVisionResponse} = await fetchDataFromOpenAI(result.content, pdfData));

                // console.log("AI Vision Response: ", AIVisionResponse);
            } catch (e) {
                console.log("error getting openAIImageResponse", e);
            }
            const materials = JSON.parse(AIVisionResponse).materials;

            const aiResponse = (AIVisionResponse) ? JSON.parse(AIVisionResponse) : {};

            const { resultDocuments: updatedResultDocuments, createdVariables } = createVariablesFromJson(aiResponse, resultDocuments);

            // console.log("AI Variables: ", createdVariables);
            // console.log("Full result: ", JSON.stringify(updatedResultDocuments));
            // console.log(openAIResponse);
            // Map the contents to the original data, adding "material" to each value
            invoice.Items.values = invoice.Items.values.map((item, index) => {
                if (materials[index]) {
                    item.material = materials[index];
                }
                return item;
            });
            // console.log("name and address: ", JSON.parse(openAIResponse).consignee_name, JSON.parse(openAIResponse).consignee_address);
        } catch (e) {
            console.log(e);
        }

        let totalCost;
        try {
            // console.log('Total Token Input Price:', priceCalculator.getTotalInputPrice());
            // console.log('Total Token Output Price:', priceCalculator.getTotalOutputPrice());
            // console.log('Total Token Combined Price:', priceCalculator.getTotalCombinedPrice());
            const azureInvoicePrice = result.pages.length * (10/1000);
            // console.log('Azure Invoice Price:', azureInvoicePrice);
            totalCost = priceCalculator.getTotalCombinedPrice() + azureInvoicePrice
            // console.log("Total Cost: ", totalCost)
            invoice.Price = {
                "TotalTokenInputPrice": priceCalculator.getTotalInputPrice(),
                "TotalTokenOutputPrice": priceCalculator.getTotalOutputPrice(),
                "TotalTokenCombinedPrice": priceCalculator.getTotalCombinedPrice(),
                "TotalAzurePrice": azureInvoicePrice,
                "TotalCost": totalCost
            }
        } catch (e) {
            totalCost = 0
        }

        if (AWS) {
            return {
                statusCode: 200,
                body: JSON.stringify(invoice),
            };
        } else {
            console.log(JSON.stringify(invoice));
        }
    } else {
        throw new Error("Expected at least one receipt in the result.");
    }
}

// function removeBoundingRegions(data) {
//     if (Array.isArray(data)) {
//       return data.map(removeBoundingRegions);
//     } else if (typeof data === 'object' && data !== null) {
//       return Object.fromEntries(
//         Object.entries(data)
//           .filter(([key]) => key !== 'boundingRegions')
//           .map(([key, value]) => [key, removeBoundingRegions(value)])
//       );
//     } else {
//       return data;
//     }
// }  

// function getContentValues(data) {
//     let contents = [];
  
//     if (Array.isArray(data)) {
//       data.forEach(item => {
//         contents = contents.concat(getContentValues(item));
//       });
//     } else if (typeof data === 'object' && data !== null) {
//       if (data.hasOwnProperty('content')) {
//         contents.push(data.content);
//       }
//       Object.values(data).forEach(value => {
//         contents = contents.concat(getContentValues(value));
//       });
//     }
  
//     return contents;
//   }

// async function createTables(tables) {
//     if (tables.length <= 0) {
//         console.log("No tables were extracted from the document.");
//         return [];
//     } else {
//         // console.log("Tables:");
//         const extractedTables = [];
//         let i = 1;
//         for (const table of tables) {
//             // console.log("Table ", i);
//             // console.log(
//             //     `- Extracted table: ${table.columnCount} columns, ${table.rowCount} rows (${table.cells.length} cells)`
//             // );
    
//             const headers = Array(table.columnCount).fill('');
//             const rows = [];
    
//             for (const cell of table.cells ?? []) {
//                 if (cell.kind === "columnHeader") {
//                     headers[cell.columnIndex] = cell.content;
//                 } else if (cell.kind === "content") {
//                     if (!rows[cell.rowIndex - 1]) {
//                         rows[cell.rowIndex - 1] = Array(table.columnCount).fill('');
//                     }
//                     rows[cell.rowIndex - 1][cell.columnIndex] = cell.content;
//                 }
//             }
            
//             let tableData = '';
//             if (headers.length > 0) {
//                 console.log(headers.join(','));
//                 tableData += headers.join(',') + '\n';
//             }
            
//             for (const row of rows ?? []) {
//                 if (row && row.length > 0) {
//                     console.log(row.join(','));
//                     tableData += row.join(',') + '\n';
//                 }
//             }

//             // extractedTables.push({ headers, rows });
//             extractedTables.push(tableData);
//             i++;
//         }
//         return extractedTables;
//     }
// }

async function createTables(tables) {
    if (tables.length <= 0) {
        console.log("No tables were extracted from the document.");
        return [];
    }

    const extractedTables = [];
    let tableIndex = 1;

    for (const table of tables) {
        const headers = Array(table.columnCount).fill('');
        const rows = Array(table.rowCount).fill(null).map(() => Array(table.columnCount).fill(''));

        // Populate headers and rows based on the cell content
        for (const cell of table.cells ?? []) {
            if (cell.kind === "columnHeader") {
                headers[cell.columnIndex] = cell.content.trim(); // Trim to remove any unwanted spaces
            } else if (cell.kind === "content") {
                rows[cell.rowIndex - 1][cell.columnIndex] = cell.content.trim(); // Trim to ensure clean content
            }
        }

        // Format table data as a CSV string
        let tableData = headers.join(',') + '\n'; // Add headers
        for (const row of rows) {
            tableData += row.join(',') + '\n'; // Add each row
        }

        extractedTables.push(tableData); // Store the formatted table data
        // console.log(`Table ${tableIndex}:\n${tableData}`); // Log the formatted table
        tableIndex++;
    }

    return extractedTables;
}

function convertSnakeToPascal(snakeCaseString) {
    return snakeCaseString.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
}

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

function getDirectContentValues(data) {
    let contents = [];
  
    if (Array.isArray(data)) {
      data.forEach(item => {
        if (item.hasOwnProperty('content')) {
          contents.push(item.content);
        }
      });
    } else if (typeof data === 'object' && data !== null && data.hasOwnProperty('values')) {
      contents = contents.concat(getDirectContentValues(data.values));
    }
  
    return contents;
} 
  
/* handler function
    input: event, context, callback
    output: response
*/
export const handler = async (event, context) => {
  try {
    const response = await main(event);
    return response; // Return the response from main directly
  } catch (error) {
    console.error("An error occurred:", error);
    return {
      statusCode: 500, // Consider using 500 for server errors
      body: JSON.stringify(error.message), // Send back the error message
    };
  }
}

if (!AWS) {
    handler();
}