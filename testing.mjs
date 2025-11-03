import OpenAI from 'openai';
import dotenv from 'dotenv';
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

dotenv.config();

const AWS = process.env.AWS === 'true';
const Azure = process.env.AZURE === 'true';

// Define reusable schemas
const AddressSchema = z.object({
  name: z.string(),
  address: z.string(),
  address_english: z.string(),
  address_reason: z.string(),
  address_street: z.string(),
  address_city: z.string(),
  address_postal_code: z.string(),
  address_country: z.string(),
});

const ContactSchema = z.object({
  name: z.string(),
  email: z.string(),
  phone_direct: z.string(),
  phone_mobile: z.string(),
});

// Define the full schema
const FullResponseSchema = z.object({
  sold_to: AddressSchema,
  ship_to: AddressSchema,
  consignee: AddressSchema,
  account_manager: ContactSchema,
  consignee_contact: ContactSchema,
  ship_to_contact: ContactSchema,
  materials: z.array(
    z.object({
      index: z.number(),
      materialNumbers: z.array(z.string()),
    })
  ),
  batch_numbers: z.array(
    z.object({
      index: z.number(),
      batch: z.number(),
    })
  ),
  address_array: z.array(z.string()),
});

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
const model = 'gpt-4o';
const apiVersion = '2024-08-01-preview';
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

const prompt = `

**Paragraphs**:
["瑩芳有限公司 In Fung Co., Ltd.","採 購 單 Purchase Order","台中市協和里西屯區工業區40路61-1號 No. 61-1, 40th Rd., Taichung Industrial Park, Taichung City, Taiwan 40768 TEL 04-23550886 FAX: 04-23550996 1","/ 1","廠商編號/No .:","2035-203","廠商名稱/Name: 廠商地址/Add .:","美商伯瑞-和泰興生技(股)公司","廠商電話/Phone:","採購日期/Order Date:","113/10/01","採購單號/P.O. No .:","11310010010","幣 別/Currency:","0001","廠商傳真/ Fax:","序 No","貨品編號 Product No.","品名 規格 Product Name / Description","數量 Q' t","單位 Unit","單價 Unit Price","總價 Total Price","備 註 Notes","1","003614-2035","ID-DiaCell I-II-III Asia","10.00","KIT","1,100.000","11,000.000","雙和醫院","2","003624-2035","ID-DiaCell ABO (A1. B)","12.00","KIT","380.000","4,560.000","雙和醫院","3","004114-2035","ID-PANEL 11*4ml","1.00","KIT","3,000.000","3,000.000","雙和醫院","4","004134-2035","ID-DIA (DIEGO) POSITIV 10ml","10.00","KIT","520.000","5,200.000","雙和醫院","5","009290-2035","ID-DILUENT 2 FOR IH-1000","2.00","KIT","2,580.000","5,160.000","雙和醫院","6","009818-2035","IH-CONCENTR. WASH SOL. A 10*100ml","8.00","KIT","2,200.000","17,600.000","雙和醫院","小","計:46,520.00 營 業 稅:2,326.00","總","計:48,846.00","備","註: 客戶代號:1100988 地址代號:2124341 送貨地址:新北市中和區中山路2段348巷8號11樓 倉庫","收件單位:和泰興生技(股)公司 聯絡人:忻尚武先生","電話:02-22467799 #653","出貨時請先通知批號及效期,預訂交貨日若無法配合請事先通知;發票請寄回瑩芳 有限公司 敬請10/2出貨,貨寄和泰興生技(股)公司 貨單請備註訂單號碼:22369","訂貨方式: :unselected: E-Mail",":unselected: 傳真",":unselected: 電話","審核:","採購:","請購:","f.84.12"]

**Tables**:
["Table 1:\n廠商編號/No .:,2035-203\n廠商名稱/Name: 廠商地址/Add .:,美商伯瑞-和泰興生技(股)公司\n廠商電話/Phone:,\n","Table 2:\n採購日期/Order Date:,113/10/01\n採購單號/P.O. No .:,11310010010\n幣 別/Currency:,0001\n","Table 3:\n序 No,貨品編號 Product No.,品名 規格 Product Name / Description,數量 Q' t,單位 Unit,單價 Unit Price,總價 Total Price,備 註 Notes\n1,003614-2035,ID-DiaCell I-II-III Asia,10.00,KIT,1,100.000,11,000.000,雙和醫院\n2,003624-2035,ID-DiaCell ABO (A1. B),12.00,KIT,380.000,4,560.000,雙和醫院\n3,004114-2035,ID-PANEL 11*4ml,1.00,KIT,3,000.000,3,000.000,雙和醫院\n4,004134-2035,ID-DIA (DIEGO) POSITIV 10ml,10.00,KIT,520.000,5,200.000,雙和醫院\n5,009290-2035,ID-DILUENT 2 FOR IH-1000,2.00,KIT,2,580.000,5,160.000,雙和醫院\n6,009818-2035,IH-CONCENTR. WASH SOL. A 10*100ml,8.00,KIT,2,200.000,17,600.000,雙和醫院\n","Table 4:\n小,計:46,520.00 營 業 稅:2,326.00,總,計:48,846.00\n備,註: 客戶代號:1100988 地址代號:2124341 送貨地址:新北市中和區中山路2段348巷8號11樓 倉庫,,\n,收件單位:和泰興生技(股)公司 聯絡人:忻尚武先生,,電話:02-22467799 #653\n,出貨時請先通知批號及效期,預訂交貨日若無法配合請事先通知;發票請寄回瑩芳 有限公司 敬請10/2出貨,貨寄和泰興生技(股)公司 貨單請備註訂單號碼:22369,,\n"]

**Invoice Items**:
["Table 1:\n廠商編號/No .:,2035-203\n廠商名稱/Name:\n廠商地址/Add .:,美商伯瑞-和泰興生技(股)公司\n廠商電話/Phone:,\n","Table 2:\n採購日期/Order Date:,113/10/01\n採購單號/P.O. No .:,11310010010\n幣 別/Currency:,0001\n","Table 3:\n序\nNo,貨品編號\nProduct No.,品名 規格\nProduct Name / Description,數量\nQ' t,單位\nUnit,單價\nUnit\nPrice,總價\nTotal\nPrice,備 註\nNotes\n1,003614-2035,ID-DiaCell I-II-III Asia,10.00,KIT,1,100.000,11,000.000,雙和醫院\n2,003624-2035,ID-DiaCell ABO (A1. B),12.00,KIT,380.000,4,560.000,雙和醫院\n3,004114-2035,ID-PANEL 11*4ml,1.00,KIT,3,000.000,3,000.000,雙和醫院\n4,004134-2035,ID-DIA (DIEGO) POSITIV 10ml,10.00,KIT,520.000,5,200.000,雙和醫院\n5,009290-2035,ID-DILUENT 2 FOR IH-1000,2.00,KIT,2,580.000,5,160.000,雙和醫院\n6,009818-2035,IH-CONCENTR. WASH SOL. A 10*100ml,8.00,KIT,2,200.000,17,600.000,雙和醫院\n","Table 4:\n小,計:46,520.00\n營\n業 稅:2,326.00,總,計:48,846.00\n備,註:\n客戶代號:1100988\n地址代號:2124341\n送貨地址:新北市中和區中山路2段348巷8號11樓 倉庫,,\n,收件單位:和泰興生技(股)公司 聯絡人:忻尚武先生,,電話:02-22467799 #653\n,出貨時請先通知批號及效期,預訂交貨日若無法配合請事先通知;發票請寄回瑩芳\n有限公司\n敬請10/2出貨,貨寄和泰興生技(股)公司\n貨單請備註訂單號碼:22369,,\n"]

`;

const instructions = `# Instructions

### Key Rule
- **Never select Bio-Rad** for any field. If Bio-Rad is selected, it's incorrect. Bio-Rad is the vendor and should never be referenced.

### Language
- Keep the original language for all fields. For addresses, provide both the original and English translations.

### Extraction Guidelines
1. **Sold To, Ship To, and Consignee**: Extract these fields.  
   - **The \`name\` field is crucial and must always be extracted if available.**  
   - If \`name\` is missing, leave it blank but ensure the address is still extracted.  
   - Only select the address for address fields; do not include the name of the business in the address.  
   - Use \`ship_to\` information if \`consignee\` is missing.  
   - Never use vendor information (e.g., Bio-Rad).  
   - Note: \`sold_to\` can appear as Distributor or similar as well. As long as it's not Bio-Rad, this is correct.

2. **Material Numbers**: Use the header row to help identify the column for material numbers. When recording the index for each row, subtract 1 to exclude the header row from the count. Index starts at 0 without the header.
   - Extract all possible material numbers (alphanumeric patterns) from the data, ensuring that:
     - The results are formatted as arrays of arrays, where each sub-array corresponds to one row of data.
     - Material numbers may appear in any field, including descriptions, and there could be multiple matches within a single row.
     - Use regular expressions to identify material numbers, capturing patterns such as alphanumeric strings with or without hyphens (e.g., LS-041, C-310-5).
     - If the header does not explicitly label a column as "Material," include matches from all potential columns.

3. **Batch Numbers**: Extract batch numbers from the arrays. Use the header row to identify the column containing the batch numbers. When recording the index of each batch number, subtract 1 to exclude the header row from the count.
   - **Lot Numbers**: Treat lot numbers as batch numbers. These are used interchangeably.

5. **Contact Person For Delivery**: Extract contact details (name, email, phone). Leave blank for missing info.

6. **Account Manager**: Extract account manager details.

7. **Country Code**: Extract two-letter codes from addresses.

8. **Other Addresses**: Extract remaining addresses excluding \`sold_to\`, \`ship_to\`, or \`consignee\`.

9. **Bio-Rad Check**: If \`sold_to\`, \`ship_to\`, or \`consignee\` contains "Bio-Rad", select a different address.

### Response Format
Use this JSON structure:
{
    "sold_to": {
        "name": "ACME Corp",
        "address": "1234 Main St, Anytown, USA",
        "address_english": "1234 Main St, Anytown, USA",
        "address_reason": "value",
        "address_street": "1234 Main"
        "address_city": "Anytown",
        "address_postal_code": "12345",
        "address_country": "US"
    },
    "ship_to": {
        "name": "ACME Corp",
        "address": "1234 Main St, Anytown, USA",
        "address_english": "1234 Main St, Anytown, USA",
        "address_reason": "value",
        "address_street": "1234 Main",
        "address_city": "Anytown",
        "address_postal_code": "12345",
        "address_country": "US"
    },
    "consignee": {
        "name": "ACME Corp",
        "address": "1234 Main St, Anytown, USA",
        "address_english": "1234 Main St, Anytown, USA",
        "address_reason": "value",
        "address_street": "1234 Main",
        "address_city": "Anytown",
        "address_postal_code": "12345",
        "address_country": "US"
    },
    "account_manager": {
        "name": "John Doe",
        "email": "",
        "phone_direct": "",
        "phone_mobile": ""
    },
    "consignee_contact": {
        "name": "John Doe",
        "email": "",
        "phone_direct": "",
        "phone_mobile": ""
    },
    "ship_to_contact": {
        "name": "John Doe",
        "email": "",
        "phone_direct": "",
        "phone_mobile": ""
    },
    "materials": [
        {
            "index": 0,
            "materialNumbers": [
                "123", 
                "A456"
            ]
        }
    ],
    "batch_numbers": [
        {
            "index": 0,
            "batch": 123
        }
    ],
    "address_array": ["address 1", "address 2", ...]
}`;

console.time("Processing time");
// Generate response
const completion = await openai.beta.chat.completions.parse({
  model: "gpt-4o",
  messages: [
    { role: "system", content: instructions },
    { role: "user", content: prompt },
  ],
  response_format: zodResponseFormat(FullResponseSchema, "response"),
});
console.log(JSON.stringify(completion));
const response = completion.choices[0].message.parsed;
console.log(JSON.stringify(response));
console.timeEnd("Processing time");