import xlsx from 'xlsx';
import fs from 'fs';
import OpenAI from 'openai';
import { Pinecone } from "@pinecone-database/pinecone";
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const pinecone_api_key = process.env.PINECONE_API_KEY;
const vectorIndexName = 'addresses';
const vectorNamespace = 'address_v3_adrc'; // addresses, name, name_address, address_default, address_v2, address_v3_adrc
const embeddingModel = 'text-embedding-3-small'; // text-embedding-3-small, text-embedding-3-large

// Load the Excel file
const workbook = xlsx.readFile('./dev_data/Round1 E2D Customers.XLSX');

// Log available sheet names to verify correctness
console.log("Available sheet names:", workbook.SheetNames);

const sheetNameKna1 = 'kna1';
// const sheetNameChinese = 'chinese';
const worksheetKna1 = workbook.Sheets[sheetNameKna1];
// const worksheetChinese = workbook.Sheets[sheetNameChinese];
const sheetNameUniversalAddress = 'adrc';
const worksheetUniversal = workbook.Sheets[sheetNameUniversalAddress];

// Convert sheets to JSON, skipping the first row
const dataKna1 = xlsx.utils.sheet_to_json(worksheetKna1, { range: 1, header: 1 });
// const dataChinese = xlsx.utils.sheet_to_json(worksheetChinese, { range: 1, header: 1 });
const dataUniversal = xlsx.utils.sheet_to_json(worksheetUniversal, { range: 1, header: 1 });

// Log sample rows from chinese sheet to verify data extraction
// console.log("Sample rows from chinese sheet:", dataChinese.slice(0, 5));

console.log("Sample rows from universal sheet:", dataUniversal.slice(0, 5));

// Extract kna1 data
const kna1Records = dataKna1.map(row => {
    const oneLineAddress = [
        row[8],  // Street
        row[4],  // City
        row[5],  // Postal Code
        row[1]   // Country
    ].filter(Boolean).join(', ');

    return {
        customer: row[0] ? row[0] : '',                                 // Column A
        country: row[1] ? String(row[1]).toLowerCase() : '',            // Column B
        name1: row[2] ? String(row[2]).toLowerCase() : '',              // Column C
        name2: row[3] ? String(row[3]).toLowerCase() : '',              // Column D
        city: row[4] ? String(row[4]).toLowerCase() : '',               // Column E
        postalCode: row[5] ? row[5] : '',                               // Column F
        region: row[6] ? String(row[6]).toLowerCase() : '',             // Column G
        searchTerm: row[7] ? String(row[7]).toLowerCase() : '',         // Column H
        street: row[8] ? String(row[8]).toLowerCase() : '',             // Column I
        telephone1: row[9] ? row[9] : '',                               // Column J
        faxNumber: row[10] ? row[10] : '',                              // Column K
        oneTimeAccount: row[11] ? String(row[11]).toLowerCase() : '',   // Column L
        address: row[12] ? String(row[12]).toLowerCase() : '',          // Column M
        oneLineAddress: oneLineAddress.toLowerCase()                    // Ensures this is also lowercase
    };
});

// Extract chinese data
// const chineseRecords = dataChinese.map(row => {
//     return {
//         addressNumber: row[0] ? String(row[0]).toLowerCase() : '',  // Address Number (previously columnA)
//         addressVersion: row[1] ? row[1] : '',                       // Address Version
//         title: row[4] ? row[4] : '',                                // Title
//         name: row[5] ? row[5] : '',                                 // Name
//         name2: row[6] ? row[6] : '',                                // Name 2
//         name3: row[7] ? row[7] : '',                                // Name 3
//         name4: row[8] ? row[8] : '',                                // Name 4
//         convertedName: row[9] ? row[9] : '',                        // Converted name (with form of address)
//         careOfName: row[10] ? row[10] : '',                         // c/o name
//         city: row[11] ? row[11] : '',                               // City
//         district: row[12] ? row[12] : '',                           // District
//         postalCode: row[19] ? String(row[19]).toLowerCase() : '',   // Postal Code
//         street: row[34] ? String(row[34]).toLowerCase() : '',       // Street
//         houseNumber: row[38] ? row[38] : '',                        // House Number
//         countryKey: row[47] ? String(row[47]).toLowerCase() : '',   // Country Key
//         region: row[49] ? String(row[49]).toLowerCase() : ''        // Region
//     };
// });

// Extract universal address data
const universalRecords = dataUniversal.map(row => {
    // console.log("Row:", row);
    return {
        universalAddressNumber: row[0] ? String(row[0]).toLowerCase() : '',  // Address Number (previously columnA)
        universalAddressVersion: row[2] ? row[2] : '',                       // Address Version
        universalTitle: row[4] ? row[4] : '',                                // Title
        universalName: row[5] ? row[5] : '',                                 // Name
        universalName2: row[6] ? row[6] : '',                                // Name 2
        universalName3: row[7] ? row[7] : '',                                // Name 3
        universalName4: row[8] ? row[8] : '',                                // Name 4
        universalConvertedName: row[9] ? row[9] : '',                        // Converted name (with form of address)
        universalCareOfName: row[10] ? row[10] : '',                         // c/o name
        universalCity: row[11] ? row[11] : '',                               // City
        universalDistrict: row[12] ? row[12] : '',                           // District
        universalPostalCode: row[19] ? String(row[19]).toLowerCase() : '',   // Postal Code
        universalStreet: row[34] ? String(row[34]).toLowerCase() : '',       // Street
        universalHouseNumber: row[38] ? row[38] : '',                        // House Number
        universalCountryKey: row[47] ? String(row[47]).toLowerCase() : '',   // Country Key
        universalRegion: row[49] ? String(row[49]).toLowerCase() : ''        // Region
    };
});

// Log the total number of records and the first 10 address numbers from both sheets to verify
console.log("Total kna1 records:", kna1Records.length);
// console.log("Total chinese records:", chineseRecords.length);
console.log("Total universal records:", universalRecords.length);
console.log("First 10 addresses from kna1:", kna1Records.slice(0, 10).map(record => record.address));
// console.log("First 10 address numbers from chinese:", chineseRecords.slice(0, 10).map(record => record.addressNumber));
console.log("First 10 address numbers from universal:", universalRecords.slice(0, 10));

// Join kna1 and chinese on kna1.address and chinese.addressNumber
// const records = kna1Records.map(kna1 => {
//     const matchingChinese = chineseRecords.find(chinese => chinese.addressNumber === kna1.address);
//     if (!matchingChinese) {
//         return {
//             ...kna1,
//             chineseData: null
//         };
//     }

//     return {
//         ...kna1,
//         addressNumber: matchingChinese.addressNumber,
//         addressVersion: matchingChinese.addressVersion,
//         title: matchingChinese.title,
//         chineseName: matchingChinese.name,
//         chineseName2: matchingChinese.name2,
//         chineseName3: matchingChinese.name3,
//         chineseName4: matchingChinese.name4,
//         convertedName: matchingChinese.convertedName,
//         careOfName: matchingChinese.careOfName,
//         chineseCity: matchingChinese.city,
//         district: matchingChinese.district,
//         chinesePostalCode: matchingChinese.postalCode,
//         chineseStreet: matchingChinese.street,
//         houseNumber: matchingChinese.houseNumber,
//         chineseCountryKey: matchingChinese.countryKey,
//         chineseRegion: matchingChinese.region
//     };
// });
// const records = kna1Records.map(kna1 => {
//     const matchingUniversal = universalRecords.find(universal => 
//         universal.universalAddressNumber.trim().toLowerCase() === kna1.address.trim().toLowerCase()
//     );

//     if (!matchingUniversal) {
//         return {
//             ...kna1,
//             universalData: null
//         };
//     }

//     console.log("Matching Universal Found:", matchingUniversal); // Ensure this shows correct universal entry

//     return {
//         ...kna1,
//         universalAddressNumber: matchingUniversal.universalAddressNumber,
//         universalAddressVersion: matchingUniversal.universalAddressVersion,
//         universalTitle: matchingUniversal.universalTitle,
//         universalName: matchingUniversal.universalName,
//         universalName2: matchingUniversal.universalName2,
//         universalName3: matchingUniversal.universalName3,
//         universalName4: matchingUniversal.universalName4,
//         universalConvertedName: matchingUniversal.universalConvertedName,
//         universalCareOfName: matchingUniversal.universalCareOfName,
//         universalCity: matchingUniversal.universalCity,
//         universalDistrict: matchingUniversal.universalDistrict,
//         universalPostalCode: matchingUniversal.universalPostalCode,
//         universalStreet: matchingUniversal.universalStreet,
//         universalHouseNumber: matchingUniversal.universalHouseNumber,
//         universalCountryKey: matchingUniversal.universalCountryKey,
//         universalRegion: matchingUniversal.universalRegion
//     };
// });

// Step 1: Group universal records by address number
const groupedUniversalRecords = universalRecords.reduce((acc, record) => {
    const { universalAddressNumber, universalAddressVersion } = record;

    if (!acc[universalAddressNumber]) {
        acc[universalAddressNumber] = { standard: null, international: null };
    }

    if (universalAddressVersion === 'I') {
        acc[universalAddressNumber].international = record; // International version
    } else {
        acc[universalAddressNumber].standard = record; // Standard version
    }

    return acc;
}, {});

// Step 2: Map kna1 records and include both versions from universal records
const records = kna1Records.map(kna1 => {
    const matchingUniversal = groupedUniversalRecords[kna1.address];

    if (!matchingUniversal) {
        return {
            ...kna1,
            universalData: null
        };
    }

    return {
        ...kna1,
        standardAddress: matchingUniversal.standard || null, // Include standard version if exists
        internationalAddress: matchingUniversal.international || null // Include international version if exists
    };
});

// Log to verify
console.log(records);

// Save the joined JSON to a file
fs.writeFileSync('joinedRecords.json', JSON.stringify(records, null, 2));

console.log('Records extracted successfully!');

/** Function to make API call */
async function getParsedAddress(oneLineAddress) {
    try {
        // go rest docker: options: parse
        // rest docker options: parser, expandparser

        const dockerUsed = 'rest'; // go-rest, rest
        const request = (dockerUsed === 'rest') ? {
            query: oneLineAddress
        } : {
            address: oneLineAddress,
            title_case: true
        }; // parser, expandparser

        const response = await axios.post('http://34.219.176.221/expandparser', request, {
            headers: {
                'accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });

        return response.data;
    } catch (error) {
        console.error("Error parsing address:", error);
        return null; // Return null if the API call fails
    }
}

/** Pinecone and Embedding Functions */
async function createEmbedding(input) {
    const resource = 'bio-sf-ai';
    const model = embeddingModel;
    const apiVersion = '2023-07-01-preview';
    const apiKey = process.env.AZURE_API_KEY2;
    const openai = new OpenAI({
        apiKey: apiKey,
        baseURL: `https://${resource}.openai.azure.com/openai/deployments/${model}`,
        defaultQuery: { 'api-version': apiVersion },
        defaultHeaders: { 'api-key': apiKey },
    });

    const embeddingResponse = await openai.embeddings.create({
        model: embeddingModel,
        input: `${input}`,
    });

    return embeddingResponse.data[0].embedding;
}

async function initializePinecone(pineconeApiKey, indexName) {
    const pinecone = new Pinecone({
        apiKey: pineconeApiKey
    });
    const index = pinecone.index(indexName);
    console.log("Pinecone client and index initialized");
    return index;
}

async function upsert(index, namespace = '', vectors) {
    try {
        const ns = index.namespace(namespace);
        return await ns.upsert(vectors);
    } catch (error) {
        if (error.response) {
            console.log("Pinecone Error:", await error);
        } else {
            console.log("Error making Pinecone API call:", error);
        }
    }
}

// (async () => {
//     const pineconeIndex = await initializePinecone(pinecone_api_key, vectorIndexName);
//     const batchSize = 50; // approximate number of records to upsert in each batch
//     const vectors = [];
//     let batchStart = 1;

//     console.log("record count: ", records.length);
//     for (let i = 0; i < records.length; i++) {
//         const record = records[i];

//         if (
//             vectorNamespace !== "address_v2" 
//             && vectorNamespace !== "address_v2_large"
//             && vectorNamespace !== "address_v3_adrc"
//         ) {
//             const parsedAddress = await getParsedAddress(record.oneLineAddress);

//             // Convert parsed address object to a string for embedding input
//             const parsedAddressText = parsedAddress 
//                 ? Object.values(parsedAddress).filter(Boolean).join(', ')
//                 : record.oneLineAddress; // Fallback to oneLineAddress if parsing fails

//             let embedding;
//             if (vectorNamespace === 'name') {
//                 embedding = await createEmbedding(record.name1);
//             } else if (vectorNamespace === 'address_default') {
//                 embedding = await createEmbedding(record.oneLineAddress);
//             } else if (vectorNamespace === 'name_address') {
//                 embedding = await createEmbedding(record.name1 + ' ' + parsedAddressText);
//             } else {
//                 embedding = await createEmbedding(parsedAddressText);
//             }

//             const embeddingId = `${record.customer}`;
//             vectors.push({
//                 id: embeddingId,
//                 values: embedding,
//                 metadata: {
//                     customer: record.customer,
//                     country: record.country,
//                     name1: record.name1,
//                     name2: record.name2,
//                     city: record.city,
//                     postalCode: record.postalCode,
//                     region: record.region,
//                     searchTerm: record.searchTerm,
//                     street: record.street,
//                     telephone1: record.telephone1,
//                     faxNumber: record.faxNumber,
//                     oneTimeAccount: record.oneTimeAccount,
//                     address: record.address,
//                     oneLineAddress: record.oneLineAddress,
//                     parsedAddress: parsedAddress ? JSON.stringify(parsedAddress) : '',
//                     addressNumber: record.addressNumber,
//                     addressVersion: record.addressVersion,
//                     title: record.title,
//                     universalName: record.universalName,
//                     universalName2: record.universalName2,
//                     universalName3: record.universalName3,
//                     universalName4: record.universalName4,
//                     convertedName: record.convertedName,
//                     careOfName: record.careOfName,
//                     universalCity: record.universalCity,
//                     district: record.district,
//                     universalPostalCode: record.universalPostalCode,
//                     universalStreet: record.universalStreet,
//                     houseNumber: record.houseNumber,
//                     universalCountryKey: record.universalCountryKey,
//                     universalRegion: record.universalRegion
//                 }
//             });
//         } else {
//             // address_v2 namespace
//             const parsedAddress = await getParsedAddress(record.oneLineAddress);
//             for (const entry of parsedAddress) {
//                 // Use the `data` field from each parsed address to create the embedding
//                 const embedding = await createEmbedding(entry.data);

//                 const sanitizedData = entry.data
//                     .replace(/\s+/g, '_')           // Replace spaces with underscores
//                     .replace(/[^a-zA-Z0-9_-]/g, ''); // Remove non-ASCII characters and keep only letters, numbers, underscores, and hyphens
//                 const embeddingId = `${record.customer}-${sanitizedData}`;

//                 // Validate length
//                 if (embeddingId.length > 512) {
//                     throw new Error(`Embedding ID exceeds the maximum length of 512 characters.`);
//                 }

//                 vectors.push({
//                     id: embeddingId,
//                     values: embedding,
//                     metadata: {
//                         customer: record.customer,
//                         country: record.country,
//                         name1: record.name1,
//                         name2: record.name2,
//                         city: record.city,
//                         postalCode: record.postalCode,
//                         region: record.region,
//                         searchTerm: record.searchTerm,
//                         street: record.street,
//                         telephone1: record.telephone1,
//                         faxNumber: record.faxNumber,
//                         oneTimeAccount: record.oneTimeAccount,
//                         address: record.address,
//                         oneLineAddress: record.oneLineAddress,
//                         parsedAddress: entry.data,
//                         addressNumber: record.addressNumber,
//                         addressVersion: record.addressVersion,
//                         title: record.title,
//                         universalName: record.universalName,
//                         universalName2: record.universalName2,
//                         universalName3: record.universalName3,
//                         universalName4: record.universalName4,
//                         convertedName: record.convertedName,
//                         careOfName: record.careOfName,
//                         universalCity: record.universalCity,
//                         district: record.district,
//                         universalPostalCode: record.universalPostalCode,
//                         universalStreet: record.universalStreet,
//                         houseNumber: record.houseNumber,
//                         universalCountryKey: record.universalCountryKey,
//                         universalRegion: record.universalRegion
//                     }
//                 });
//             }
//         }

//         // If batch is full or it's the last record, upsert and reset the batch
//         const batchEnd = i + 1;
//         if (vectors.length >= batchSize || i === records.length - 1) {
//             await upsert(pineconeIndex, vectorNamespace, vectors);
//             console.log(`Upserted batch of ${vectors.length} addresses from record ${batchStart} to ${batchEnd}`);
            
//             vectors.length = 0; // Clear the array for the next batch
//             batchStart = batchEnd + 1; // Set the start for the next batch
//         }
//     }

//     console.log("Data upserted into Pinecone successfully!");
// })();
