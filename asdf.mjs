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
import { searchCustomer } from "./search-customer.mjs";
import { checkKNVP } from "./knvp-check.mjs";
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


async function finalAddressCheckOpenAI(newObj) {

// const instructions = `## Address Check

// ### Instructions
// For each address type (sold_to, ship_to, consignee), iterate through the corresponding "number" array.
// - If a valid customer_code is present, return that.
// - Otherwise, determine the best match by checking which number object is the closest match based on name (or translatedName) that either exactly or closely match those in the provided address (or address_english)  (e.g., house number, street name, building/floor/unit details).
// - Only use the similarity score as a tiebreaker if multiple candidates match the key address elements.

// ### Required Response Format
// Return a JSON object with:
// - The index of the best match for each address type, or \`false\` if no match is found.
// - If customer_code just return that number.
// - A corresponding reason for the choice.

// **Example:**
// {
//     "sold_to": 0,
//     "sold_to_reason": "the reason for choice",
//     "ship_to": false,
//     "ship_to_reason": "the reason for choice",
//     "consignee": 3,
//     "consignee_reason": "the reason for choice"
// }
// `;

const instructions = `## Address Check

### Matching Procedure
Go through each case starting with A and proceed to the next until a match is either found or not for each address type (sold_to, ship_to, and consignee).

#### Case A: If sold_to.customer_code or ship_to.customer_code is present:
- stop evaluation for that address type.
- assign that to sold_to or ship_to respectively.

---

#### Case B: At Least One Entry Has a Similarity Score Above 830
1. **Identify Entries Above 830:**
   - For each address type (sold_to, ship_to, consignee), iterate through the corresponding "number" array.
   - **Ignore similarity scores of 0.**
   - Collect all entries with a similarity score strictly above 830.

2. **Single vs. Multiple Matches:**
   - **Single Match:**  
     - If exactly one entry is above 830, return its index (0-based) immediately.
   - **Multiple Matches:**  
     - If more than one entry is above 830, proceed with additional evaluation:
       - **Name Comparison:** Compare the \`name\` or \`translatedName\` from the address with \`number.name\`.
       - **Address Comparison:** Compare \`address\` or \`address_english\` with \`number.address\` and \`number.house\`.
       - Determine the best match.

---

#### Case C: No Entry Has a Similarity Score Above 830
   - If a close match is found based on \`name\` or \`translatedName\` and \`address\` or \`address_english\`, return its index.
   - If multiple close matches are found, use additional criteria (\`name\` or \`translatedName\` and \`address\` or \`address_english\`) to select the best one.
   - If no match qualifies, return \`false\` for that address type.

---

### Required Response Format
Return a JSON object with:
- The index of the best match (0-based) for each address type, or \`false\` if no match is found. If customer_code just return that number.
- A corresponding reason for the choice.

**Example:**
{
    "sold_to": 0,
    "sold_to_reason": "the reason for choice",
    "ship_to": false,
    "ship_to_reason": "the reason for choice",
    "consignee": 3,
    "consignee_reason": "the reason for choice"
}
`;

    const prompt = `${JSON.stringify(newObj)}`;
    
    try {
        let apiKey;
        // if (AWS) {
        //     const secretsManagerClient = new SecretsManagerClient();
        //     const input = {
        //             SecretId: (Azure) ? "AzureOpenAIKey" : "OpenAIKey"
        //     };
        //     const command = new GetSecretValueCommand(input);
        //     const secretsResponse = await secretsManagerClient.send(command);
        //     const secret = JSON.parse(secretsResponse.SecretString);
        //     apiKey = (Azure) ? secret.AzureOpenAIKey : secret.key;
            apiKey = "e78646026ea74e90905f5264320366f3";
        // } else {
        //     if (Azure) {
        //         apiKey = process.env.AZURE_API_KEY2;
        //     } else {
        //         apiKey = process.env.OPENAI_API_KEY;
        //     }
        // }

        const resource = 'techsupport'; // temporary
        // const resource = 'bio-sf-ai';
        // const model = 'sf-ai';
        // const apiVersion = '2023-07-01-preview';
        // const model = 'gpt-4o';
        // const apiVersion = '2024-08-01-preview';
        // const model = 'o1';
        // const apiVersion = '2024-12-01-preview';
        const model = 'o3-mini';
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

        const messages = [
            {"role": "system", "content": instructions},
            {"role": "user", "content": prompt}
        ];

        console.log(messages);

        const response = await openai.chat.completions.create({
            model: aiModel,
            messages: messages,
            // temperature: 0,
            // reasoning_effort: "high",
            response_format: { type: 'json_object' }
        });

        // // AI is bad at translating, so don't ask it to translate. If anything we can send to a translation service.
        // // Also, it should test both. Keep the address in chinese and also translate it to english to see which one is a better match.
        // const selectedModel = (model === 'sf-ai') ? aiModel : model;
        // const openAIPrice = priceCalculator.calculateTokenPrice(selectedModel, response.usage);
        // console.log("openAIPrice: ", openAIPrice);

        const aiAddressCheckResponse = response.choices[0].message.content.trim();
        console.log("aiAddressCheckResponse: ", aiAddressCheckResponse);
    } catch (error) {
        console.error("Error in finalAddressCheckOpenAI:", error);
    }
}

const newObj = {
    "sold_to": {
      "name": "fisher scientific worldwide (shanghai) co. , ltd. 伯乐生命医学产品(上海)有限公司",
      "translatedName": "fisher scientific worldwide (shanghai) co., ltd.",
      "address": "中国(上海)自由贸易试验区希雅路69号15号厂房4层c 部位 ,上海 , cn",
      "address_english": "china (shanghai) free trade zone, xiya road no.69, factory 15, 4th floor, c section, shanghai, cn",
      "translatedAddress": "Location C, 4th Floor, Building 15, No. 69, Xiya Road, China (Shanghai) Pilot Free Trade Zone, Shanghai, cn",
      "number": [
        {
          "name": "diasorin ltd",
          "customer": 1096659,
          "international": false,
          "address": "no 69 yuanfeng road, shanghai, 200444, cn",
          "house": "",
          "similarity": 579
        },
        {
          "name": "飞世尔实验器材(上海)有限公司",
          "customer": 1096220,
          "international": true,
          "address": "上海 中国（上海）自由贸易实验区奥纳路 飞世尔实验器材(上海)有限公司",
          "house": "55号",
          "similarity": 438
        },
        {
          "name": "上海傲喆企业管理有限公司",
          "customer": 1096380,
          "international": true,
          "address": "上海 中国（上海）自由贸易试验区富特北路211号302部位368室 上海傲喆企业管理有限公司",
          "house": "",
          "similarity": 150
        },
        {
          "name": "上海金斯康生物科技有限公司",
          "customer": 1096585,
          "international": true,
          "address": "上海 中国（上海）自由贸易试验区荷丹路186号1幢2层 上海金斯康生物科技有限公司",
          "house": "",
          "similarity": 150
        },
        {
          "name": "康龙化成（成都）临床研究服务有限公司上海分公司",
          "customer": 1096706,
          "international": true,
          "address": "上海 中国（上海）自由贸易试验区金科路2829号1幢c区3层301-1室 康龙化成（成都）临床研究服务有限公司上海分公司",
          "house": "",
          "similarity": 100
        },
        {
          "name": "上海策准科技有限公司",
          "customer": 1096686,
          "international": true,
          "address": "上海 中国（上海）自由贸易试验区金科路 上海策准科技有限公司",
          "house": "4560号",
          "similarity": 50
        },
        {
          "name": "赛默飞世尔科技（中国）有限公司",
          "customer": 1096234,
          "international": true,
          "address": "上海 中国（上海）自由贸易试验区德堡路 赛默飞世尔科技（中国）有限公司",
          "house": "379号",
          "similarity": 50
        },
        {
          "name": "上海美雅珂生物技术有限责任公司",
          "customer": 1096434,
          "international": true,
          "address": "上海 中国（上海）自由贸易试验区张江路 上海美雅珂生物技术有限责任公司",
          "house": "1238弄",
          "similarity": 50
        }
      ],
      "customer_code": ""
    },
    "ship_to": {
      "name": "fisher scientific worldwide (shanghai)co., ltd 飞世尔实验器材(上海)有限公司",
      "translatedName": "fisher scientific worldwide (shanghai)co., ltd",
      "address": "no. 669 qiuxiang rd,no.2 building, 1/f, unit 2101 ,2102,2103 上海市浦东新区秋祥路669号2 号库1楼2101、2102、21 03单元",
      "address_english": "no. 669 qiuxiang rd, no.2 building, 1/f, unit 2101, 2102, 2103; qiu xiang road 669, warehouse no.2, 1st floor, units 2101, 2102, 2103, pudong new district, shanghai",
      "translatedAddress": "No. 669 Qiuxiang rd, no.2 building, 1/f, unit 2101 ,2102,2103",
      "number": [
        {
          "name": "fisher scientific worldwide",
          "customer": 2126617,
          "international": false,
          "address": "no. 669 qiuxiang rd,, shanghai, 201306, cn",
          "house": "",
          "similarity": 1367
        },
        {
          "name": "fisher scientific worldwide(shangha",
          "customer": 2120641,
          "international": false,
          "address": "no 27 xin jinqiao ro, 000000, cn",
          "house": "",
          "similarity": 1002
        },
        {
          "name": "qinghai lianming trading co., ltd.",
          "customer": 1096373,
          "international": false,
          "address": "xinqian isquare, jianguo south r, 1, xining, 810007, cn",
          "house": "",
          "similarity": 629
        },
        {
          "name": "jiangsu xiansheng pharmaceutical co",
          "customer": 1096599,
          "international": false,
          "address": "no 699-18 xuanwu avenue, nanjing, 210023, cn",
          "house": "",
          "similarity": 583
        },
        {
          "name": "guangzhou cytodia biotech co., ltd.",
          "customer": 1096612,
          "international": false,
          "address": "no. 188 kaiyuan avenue,, room 601, guangzhou, 510535, cn",
          "house": "",
          "similarity": 581
        },
        {
          "name": "guangzhou weiyuan medical instrumen",
          "customer": 1096622,
          "international": false,
          "address": "no 301 building g10 south, guangzhou, 510663, cn",
          "house": "",
          "similarity": 573
        },
        {
          "name": "beijing zhiren meibo biotechnology",
          "customer": 1096652,
          "international": false,
          "address": "no 22 tongji north road, 738, beijing, 100176, cn",
          "house": "",
          "similarity": 572
        },
        {
          "name": "guangzhou chengyuan genomics techno",
          "customer": 1096651,
          "international": false,
          "address": "no 18 shenzhou road, 1401, guangzhou, 510663, cn",
          "house": "",
          "similarity": 559
        },
        {
          "name": "飞世尔实验器材（上海）有限公司",
          "customer": 2126617,
          "international": true,
          "address": "上海市 秋祥路 飞世尔实验器材（上海）有限公司",
          "house": "669号",
          "similarity": 450
        },
        {
          "name": "飞世尔实验器材（上海）有限公司",
          "customer": 2120641,
          "international": true,
          "address": "上海市 新金桥路 飞世尔实验器材（上海）有限公司",
          "house": "27号",
          "similarity": 50
        }
      ],
      "customer_code": ""
    },
    "consignee": {
      "name": "fisher scientific worldwide (shanghai)co., ltd 飞世尔实验器材(上海)有限公司",
      "translatedName": "fisher scientific worldwide (shanghai)co., ltd",
      "address": "no. 669 qiuxiang rd,no.2 building, 1/f, unit 2101 ,2102,2103 上海市浦东新区秋祥路669号2 号库1楼2101、2102、21 03单元",
      "address_english": "no. 669 qiuxiang rd, no.2 building, 1/f, unit 2101, 2102, 2103; qiu xiang road 669, warehouse no.2, 1st floor, units 2101, 2102, 2103, pudong new district, shanghai",
      "translatedAddress": "No. 669 Qiuxiang rd, no.2 building, 1/f, unit 2101 ,2102,2103",
      "number": [
        {
          "name": "fisher scientific worldwide",
          "customer": 2126617,
          "international": false,
          "address": "no. 669 qiuxiang rd,, shanghai, 201306, cn",
          "house": "",
          "similarity": 1367
        },
        {
          "name": "fisher scientific worldwide(shangha",
          "customer": 2120641,
          "international": false,
          "address": "no 27 xin jinqiao ro, 000000, cn",
          "house": "",
          "similarity": 1002
        },
        {
          "name": "飞世尔实验器材（上海）有限公司",
          "customer": 2126617,
          "international": true,
          "address": "上海市 秋祥路 飞世尔实验器材（上海）有限公司",
          "house": "669号",
          "similarity": 450
        },
        {
          "name": "飞世尔实验器材（上海）有限公司",
          "customer": 2120641,
          "international": true,
          "address": "上海市 新金桥路 飞世尔实验器材（上海）有限公司",
          "house": "27号",
          "similarity": 50
        }
      ],
      "customer_code": ""
    }
  }

console.time("run time");
await finalAddressCheckOpenAI(newObj);
console.timeEnd("run time");
