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
const vectorNamespace = process.env.NAMESPACE || "address_v8_prod_adrc"; // address_default, addresses, name, name_address, address_v2, address_v3_adrc, address_v3_qa_adrc, address_v4_qa_adrc


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
async function finalAddressCheckOpenAI(prompt) {
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

        const instructions = `## Address Check

        1. Check Similarity Scores First:
           - Iterate through the "number" array for each address type (sold_to, ship_to, consignee).
           - If any similarity in the "number" array is above 830:
             - Immediately return the index of that entry.
             - Stop evaluating further entries in the array for that address type and move to the next address type.
           - If more than one entry has a similarity above 830, proceed to criteria evaluation.
           - Do not reference similarity score if it's 0.
        
        2. Criteria Evaluation for Multiple Matches:
           - If multiple entries have a similarity above 830:
             - Compare name or translatedName fields with the corresponding number.name.
             - Use fuzzy matching to identify the best match.
           - Compare address and address_english fields with number.address and number.house:
             - Allow for variations such as different spellings, formatting differences, or case insensitivity.
             - Use Levenshtein distance or a similarity ratio:
               - Distance threshold: 10-15.
               - Similarity ratio: At least 70%.
        
        3. Fallback for No Match Above 830:
           - If no entry in the "number" array has a similarity above 830:
             - Evaluate based on fuzzy matching criteria as described in Step 2.
           - If no close match is found, return false for that address type.
        
        4. Include a reason for choice.
        
        5. Required Response Format:
           - The result for each address type should be either:
             - The index of the best match in the "number" array (0-based).
             - Or false if no suitable match is found.
           - Required JSON response format:
             {
                 "sold_to": <index or false>,
                 "sold_to_reason": <index or false>,
                 "ship_to": <index or false>,
                 "ship_to_reason": <index or false>,
                 "consignee": <index or false>,
                 "consignee_reason": <index or false>,
             }
        `;


//         1. **Check Similarity Scores First**
//    - For each address type (\`sold_to\`, \`ship_to\`, \`consignee\`):
//      1. **Filter by Similarity**:
//         - Gather all entries in the \`number\` array where \`similarity\` > 830.
//      2. **Single High Similarity**:
//         - If only **one** entry meets this criterion:
//           - **Select** its index.
//           - **Provide** the reason.
//           - **Move** to the next address type.
//      3. **Multiple High Similarity**:
//         - If **multiple** entries meet this criterion:
//           1. **Normalize Names**:
//              - Remove all punctuation and spaces.
//              - Convert all characters to lowercase.
//              - Examples:
//                - \`"Chengdu Baile Technology Co., Ltd."\` → \`"chengdubailetechnologycoltd"\`
//                - \`"chengdu baile technology co.ltd"\` → \`"chengdubailetechnologycoltd"\`
//           2. **Compare Names**:
//              - Normalize the target’s \`translatedName\`.
//              - Compare the normalized \`translatedName\` with each entry’s normalized \`name\`.
//              - **Select** the entry where the normalized names **match**.
//           3. **Select Entry**:
//              - If **one** entry matches, **select** its index.
//              - If **multiple** entries match, **select** the first entry in the \`number\` array.
//           4. **Provide** the reason for the selection.
//      4. **No High Similarity Entries**:
//         - If **no** entries have \`similarity\` > 830:
//           - **Return** \`false\` for this address type.
//           - **Provide** the reason.

//    - **Note**: Ignore any entry with a \`similarity\` of 0.

//         const instructions = `## Address Check Instructions

// 1. **Check Similarity Scores First**
//    - For each address type (\`sold_to\`, \`ship_to\`, \`consignee\`):
//      1. **Filter by Similarity**:
//         - Gather all entries in the \`number\` array where \`similarity\` > 830.
//      2. **Select Entry**:
//         - **If only one entry** meets this criterion:
//           - **Select** its index.
//           - **Provide** the reason.
//         - **If multiple entries** meet this criterion:
//           1. **Identify Highest Similarity**:
//              - Determine the **maximum similarity score** among the filtered entries.
//           2. **Select First Occurrence of Highest Similarity**:
//              - **Find the first entry in the \`number\` array** that has this highest similarity score.
//              - **Do not sort or reorder entries.**  
//              - **The first occurrence (lowest index) in the original list must always be chosen.**
//           3. **Provide** the reason for the selection.
//      3. **No High Similarity Entries**:
//         - If **no** entries have \`similarity\` > 830:
//           - **Return** \`false\` for this address type.
//           - **Provide** the reason.

//    - **Note**: Ignore any entry with a \`similarity\` of 0.

// 2. Reason for Choice  
//    - Include a short explanation for which index was chosen or why none was selected.

// 3. Required Response Format  
//    - Each address type should return either the 0-based index or \`false\`.
//    - Example JSON:
//      {
//        "sold_to": <index or false>,
//        "sold_to_reason": "<reason>",
//        "ship_to": <index or false>,
//        "ship_to_reason": "<reason>",
//        "consignee": <index or false>,
//        "consignee_reason": "<reason>"
//      }
// `;

        // note this is not exact and index.mjs does different checks; this is hardcoded; 
        // DO NOT UPDATE PROMPT -- USE NEWOBJ
            const newobj = `${JSON.stringify(prompt)}`;

    const response = await openai.chat.completions.create({
        model: aiModel,
        messages: [
            { role: "system", content: instructions },
            { role: "user", content: newobj }
        ],
        response_format: { type: 'json_object' }
    });   
    // AI is bad at translating, so don't ask it to translate. If anything we can send to a translation service.
    // Also, it should test both. Keep the address in chinese and also translate it to english to see which one is a better match.
    const selectedModel = (model === 'sf-ai') ? aiModel : model;
    const openAIPrice = priceCalculator.calculateTokenPrice(selectedModel, response.usage);
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
let addresses, finalCheck;

addresses = {
    "sold_to": {
      "name": "成都百乐科技有限公司",
      "translatedName": "Chengdu Baile Technology Co., Ltd.",
      "address": "成都成科西路3号b座3-2",
      "translatedAddress": "Room 3-2, Building B, No. 3 Chengke West Road, Chengdu",
      "number": [
        {
          "name": "成都百乐科技有限公司",
          "customer": 1096190,
          "address": "成都 成都市成科西路 成都百乐科技有限公司",
          "house": "3号",
          "similarity": 1000
        },
        {
          "name": "chengdu baile technology co.ltd",
          "customer": 1096190,
          "address": "no. 3 chengke west road, chengdu, 610042, cn",
          "house": "",
          "similarity": 982
        },
        {
          "name": "guangzhou packgene biotechnology co",
          "customer": 1096425,
          "address": "no. 3, ranyue road, science city,, guangzhou, 510670, cn",
          "house": "",
          "similarity": 663
        }
      ]
    },
    "ship_to": {
      "name": "黄虎",
      "translatedName": "Yellow Tiger",
      "address": "成都成科西路3号b座3-2",
      "translatedAddress": "Room 3-2, Building B, No. 3 Chengke West Road, Chengdu",
      "number": [
        {
          "name": "cyagen biosciences  guangzhou  inc",
          "customer": 2026161,
          "address": "3 juquan road, science city,g, 510000, cn",
          "house": "",
          "similarity": 525
        },
        {
          "name": "chengdu baile technology co.ltd",
          "customer": 1096190,
          "address": "no. 3 chengke west road, chengdu, 610042, cn",
          "house": "",
          "similarity": 484
        },
        {
          "name": "chengdu baile technology co.ltd",
          "customer": 2120551,
          "address": "no 3 chengkexi road, b6-2-1, chengdu, 610041, cn",
          "house": "",
          "similarity": 484
        },
        {
          "name": "chengdu baile technology co.ltd",
          "customer": 2120621,
          "address": "no 3 chengkexi road w, b3-2, chengdu, 610041, cn",
          "house": "",
          "similarity": 484
        },
        {
          "name": "chengdu baile technology co ltd",
          "customer": 2029657,
          "address": "3 west chengke rd, chengdu, 610000, cn",
          "house": "",
          "similarity": 484
        },
        {
          "name": "guangzhou packgene biotechnology co",
          "customer": 1096425,
          "address": "no. 3, ranyue road, science city,, guangzhou, 510670, cn",
          "house": "",
          "similarity": 475
        }
      ]
    },
    "consignee": {
      "name": "黄虎",
      "translatedName": "Yellow Tiger",
      "address": "成都成科西路3号b座3-2",
      "translatedAddress": "Room 3-2, Building B, No. 3 Chengke West Road, Chengdu",
      "number": [
        {
          "name": "cyagen biosciences  guangzhou  inc",
          "customer": 2026161,
          "address": "3 juquan road, science city,g, 510000, cn",
          "house": "",
          "similarity": 525
        },
        {
          "name": "chengdu baile technology co.ltd",
          "customer": 2120551,
          "address": "no 3 chengkexi road, b6-2-1, chengdu, 610041, cn",
          "house": "",
          "similarity": 484
        },
        {
          "name": "chengdu baile technology co.ltd",
          "customer": 2120621,
          "address": "no 3 chengkexi road w, b3-2, chengdu, 610041, cn",
          "house": "",
          "similarity": 484
        },
        {
          "name": "chengdu baile technology co ltd",
          "customer": 2029657,
          "address": "3 west chengke rd, chengdu, 610000, cn",
          "house": "",
          "similarity": 484
        }
      ]
    }
  };

finalCheck = await finalAddressCheckOpenAI(JSON.stringify(addresses));
console.log("final check response: ", JSON.stringify(finalCheck, null, 2));

addresses = {
    "sold_to": {
      "name": "瑩芳有限公司",
      "translatedName": "YING FONG LIMITED",
      "address": "台中市協和里西屯區工業區40路61-1號",
      "translatedAddress": "No. 61-1, 40th Road, Industrial Park, Xitun District, Xieheli, Taichung City",
      "number": [
        {
          "name": "芮弗士科技有限公司",
          "customer": 1101055,
          "address": "台中市 西屯區 芮弗士科技有限公司",
          "house": "15號",
          "similarity": 704
        },
        {
          "name": "in fung co., ltd.",
          "customer": 1100988,
          "address": "no 61-1 gongyequ 40th road, taichung, 40768, tw",
          "house": "",
          "similarity": 674
        }
      ]
    },
    "ship_to": {
      "name": "瑩芳有限公司",
      "translatedName": "YING FONG LIMITED",
      "address": "台中市西屯區工業區40路61-1號",
      "translatedAddress": "No. 61-1, 40th Road, Industrial Zone, Xitun District, Taichung City",
      "number": [
        {
          "name": "振杏企業有限公司",
          "customer": 2124360,
          "address": "台中市 西屯區 振杏企業有限公司",
          "house": "15號",
          "similarity": 722
        },
        {
          "name": "芮弗士科技有限公司",
          "customer": 1101055,
          "address": "台中市 西屯區 芮弗士科技有限公司",
          "house": "15號",
          "similarity": 704
        },
        {
          "name": "in fung co., ltd.",
          "customer": 1100988,
          "address": "no 61-1 gongyequ 40th road, taichung, 40768, tw",
          "house": "",
          "similarity": 674
        },
        {
          "name": "lin shin hospital",
          "customer": 2124277,
          "address": "no 36 huizhong road, taichung, 40867, tw",
          "house": "",
          "similarity": 659
        },
        {
          "name": "china medical university hospital",
          "customer": 2124321,
          "address": "no 91 xueshi road, taichung, 40454, tw",
          "house": "",
          "similarity": 579
        },
        {
          "name": "genmall biotechnology co",
          "customer": 2124265,
          "address": "no. 40, ln. 231, sec. 1, nankan rd., taoyuan city, 338217, tw",
          "house": "",
          "similarity": 550
        }
      ]
    },
    "consignee": {
      "name": "瑩芳有限公司",
      "translatedName": "YING FONG LIMITED",
      "address": "台中市西屯區工業區40路61-1號",
      "translatedAddress": "No. 61-1, 40th Road, Industrial Zone, Xitun District, Taichung City",
      "number": [
        {
          "name": "振杏企業有限公司",
          "customer": 2124360,
          "address": "台中市 西屯區 振杏企業有限公司",
          "house": "15號",
          "similarity": 722
        },
        {
          "name": "lin shin hospital",
          "customer": 2124277,
          "address": "no 36 huizhong road, taichung, 40867, tw",
          "house": "",
          "similarity": 659
        },
        {
          "name": "china medical university hospital",
          "customer": 2124321,
          "address": "no 91 xueshi road, taichung, 40454, tw",
          "house": "",
          "similarity": 579
        },
        {
          "name": "genmall biotechnology co",
          "customer": 2124265,
          "address": "no. 40, ln. 231, sec. 1, nankan rd., taoyuan city, 338217, tw",
          "house": "",
          "similarity": 550
        }
      ]
    }
  }
finalCheck = await finalAddressCheckOpenAI(JSON.stringify(addresses));
console.log("final check response: ", JSON.stringify(finalCheck, null, 2));


addresses = {
    "sold_to": {
      "name": "美商貝克曼庫爾特有限公司台灣分公司",
      "translatedName": "Beckman Coulter Taiwan Branch",
      "address": "大安區敦化南路2段216號8樓, 台北市, 106",
      "translatedAddress": "8F, No. 216, Section 2, Dunhua South Road, Da'an District, Taipei City, 106",
      "number": [
        {
          "name": "beckman coulter taiwan inc.",
          "customer": 1074229,
          "address": "8f, 216 tun hwa south road, sec. 2, taipei, 106, tw",
          "house": "",
          "similarity": 958
        },
        {
          "name": "beckman coulter taiwan inc., taiwan",
          "customer": 1100970,
          "address": "no 216 sec. 2, dunhua s. rd.,, taipei, 10669, tw",
          "house": "",
          "similarity": 916
        }
      ]
    },
    "ship_to": {
      "name": "美商貝克曼庫爾特有限公司台灣分公司",
      "translatedName": "Beckman Coulter Taiwan Branch",
      "address": "新北市汐止區工建路358號6樓, 台北市, 221",
      "translatedAddress": "6F, No. 358, Gongjian Road, Xizhi District, New Taipei City, Taipei City, 221",
      "number": [
        {
          "name": "beckman coulter taiwan inc., taiwan",
          "customer": 2124260,
          "address": "no 358 gongjian road, new taipei, 22161, tw",
          "house": "",
          "similarity": 916
        },
        {
          "name": "tcm biotech international corp",
          "customer": 1101201,
          "address": "no 97 sec.1,xiantai 5th rd.,xizhi d, new taipei, 22146, tw",
          "house": "",
          "similarity": 672
        },
        {
          "name": "novotech laboratory services",
          "customer": 1101008,
          "address": "building f no.3,yuanqu st, nangang, taipei city, 115603, tw",
          "house": "",
          "similarity": 584
        }
      ]
    },
    "consignee": {
      "name": "美商貝克曼庫爾特有限公司台灣分公司",
      "translatedName": "Beckman Coulter Taiwan Branch",
      "address": "新北市汐止區工建路358號6樓, 台北市, 221",
      "translatedAddress": "6F, No. 358, Gongjian Road, Xizhi District, New Taipei City, Taipei City, 221",
      "number": [
        {
          "name": "beckman coulter taiwan inc., taiwan",
          "customer": 2124260,
          "address": "no 358 gongjian road, new taipei, 22161, tw",
          "house": "",
          "similarity": 916
        }
      ]
    }
  };
finalCheck = await finalAddressCheckOpenAI(JSON.stringify(addresses));
console.log("final check response: ", JSON.stringify(finalCheck, null, 2));