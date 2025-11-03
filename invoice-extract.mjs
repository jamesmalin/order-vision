import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
// import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import DocumentIntelligence, { getLongRunningPoller, isUnexpected } from "@azure-rest/ai-document-intelligence";
import dotenv from 'dotenv';
dotenv.config();

const AWS = process.env.AWS === 'true';
/**
 * Process invoice in Azure.
 * @param {string} PDF - PDF file content.
 * @param {string} model - Model to use for processing.
 * @returns {Object} Result of the processing.
 */
export async function azureProcessing(PDF, model) {
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