'use strict'

import http from 'http';
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { DOMParser } from '@xmldom/xmldom';
import OpenAI from 'openai';

async function fetchAddressFromOpenAI(prompt, jsonData) {
  try {
      let apiKey;
      const secretId = "AzureOpenAIKey";
      const resource = "bio-sf-ai";
      const secretsManagerClient = new SecretsManagerClient();
      const input = {
          SecretId: secretId
      };
      const command = new GetSecretValueCommand(input);
      const secretsResponse = await secretsManagerClient.send(command);
      const secret = JSON.parse(secretsResponse.SecretString);
      apiKey = secret.AzureOpenAIKey;

      const model = "gpt-4o";
      const apiVersion = "2024-12-01-preview";
      
      const openai = new OpenAI({
        apiKey: apiKey, // defaults to 
        baseURL: `https://${resource}.openai.azure.com/openai/deployments/${model}`,
        defaultQuery: { 'api-version': apiVersion },
        defaultHeaders: { 'api-key': apiKey },
      });

      const instructions = `# Instructions
- Answer the user's question about the Order Data as accurately as possible. 
- If the information does not exist, do not make anything up. 
- Respond with HTML format only using the Styling below.
## Styling
Bold: <strong>text</strong>
Italic: <em>text</em>
Header: <h1>Text</h1>, <h2>Text</h2>, or <h3>Text</h3>
Strikethrough: <strike>text</strike>
Unordered list: <ul><li>text</li><li>text</li></ul>
Ordered list: <ol><li>text</li><li>text</li></ol>
Preformatted text: <pre>text</pre>
Blockquote: <blockquote>text</blockquote>
Hyperlink: <a href="URL">text</a>
Image link: <img src="URL" alt="description">
## Note
Always bold titles and the most important pieces of information. Always style it to look nice for the user.

## Order Data:
${JSON.stringify(jsonData)}

## Response in valid JSON:
{"response": "<h1>Your formatted response here</h1>"}`;
      
      const response = await openai.chat.completions.create({
          messages: [
              { role: "system", content: instructions },
              { role: "user", content: prompt }
          ],
          response_format: { type: 'json_object' }
      });   
      const aiResponse = response.choices[0].message.content.trim();
      return JSON.parse(aiResponse);
  
  } catch (e) {
      console.log("Error getting AI response: ", e);
  }
}

export const handler = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = true;
  const salesOrder = JSON.parse(event.body).salesOrder;
  const prompt = JSON.parse(event.body).prompt;

  var envParams = {
    dev: {
      secretID: 'purchaseOrderConfirmation',
      host: '10.240.85.61',
      port: 50100,
    }
  };
  var env = envParams.dev;

  const client = new SecretsManagerClient();
  const input = {
    SecretId: env.secretID
  };
  const command = new GetSecretValueCommand(input);
  const response = await client.send(command);
  
  if (response) {
    console.log(response);
    const secret = JSON.parse(response.SecretString)["purchaseOrderConfirmation"];

    const xml = `<ns0:ZOTC_0003_GET_ORDER_DETAILS xmlns:ns0="urn:sap-com:document:sap:rfc:functions">
<IM_SALES_ORDER>${salesOrder}</IM_SALES_ORDER>
</ns0:ZOTC_0003_GET_ORDER_DETAILS>`;

    var options = {
      host: env.host,
      port: env.port,
      path: '/RESTAdapter/GetOrderDetails',
      method: 'POST',
      headers: {
          'Content-Type': 'application/xml',
          'Accept': 'application/xml',
          'Authorization': secret
      }
    };
    
    try {
        const body = await new Promise((resolve, reject) => {
            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk);
                res.on('end', () => resolve(body));
            });

            req.on('error', reject);
            req.write(xml);
            req.end();
        });

        // Function to convert XML to JSON
        function xmlToJson(xml) {
          // Create object to store result
          const obj = {};
          
          // Get all attributes
          if (xml.attributes) {
            for (let i = 0; i < xml.attributes.length; i++) {
              const attribute = xml.attributes[i];
              obj[attribute.nodeName] = attribute.nodeValue;
            }
          }
          
          // Handle child nodes
          if (xml.hasChildNodes()) {
            for (let i = 0; i < xml.childNodes.length; i++) {
              const item = xml.childNodes[i];
              const nodeName = item.nodeName;
              
              // Skip text nodes that are just whitespace
              if (item.nodeType === 3 && !item.nodeValue.trim()) continue;
              
              // Handle text content
              if (item.nodeType === 3) {
                const text = item.nodeValue.trim();
                if (text) {
                  if (Object.keys(obj).length === 0) {
                    return text;
                  } else {
                    obj['#text'] = text;
                  }
                }
                continue;
              }
              
              // Convert child node
              const result = xmlToJson(item);
              
              // Handle arrays
              if (obj[nodeName] !== undefined) {
                if (!Array.isArray(obj[nodeName])) {
                  obj[nodeName] = [obj[nodeName]];
                }
                obj[nodeName].push(result);
              } else {
                obj[nodeName] = result;
              }
            }
          }
          
          return obj;
        }

        // Parse XML string to DOM
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(body, 'text/xml');
        
        // Convert to JSON
        const jsonData = xmlToJson(xmlDoc);

        console.log("Converted JSON Data: ", JSON.stringify(jsonData, null, 2));

        const aiResponse = await fetchAddressFromOpenAI(prompt, jsonData);

        let response = {
          statusCode: 200,
          headers: { 
              "Content-Type": "application/json"
          },
          isBase64Encoded: false,
          body: JSON.stringify(aiResponse),
        };
        callback(null, response);

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

};
