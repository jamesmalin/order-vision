import xlsx from 'xlsx';
import fs from 'fs';
import OpenAI from 'openai';
import { Pinecone } from "@pinecone-database/pinecone";
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const pinecone_api_key = process.env.PINECONE_API_KEY;
const vectorIndexName = 'addresses'; // addresses, addresses-large
const vectorNamespace = 'address_v4_prod_adrc'; // addresses, name, name_address, address_default, address_v2, address_v3_adrc, address_v3_qa_adrc, address_v3_prod_adrc
const embeddingModel = 'text-embedding-3-small'; // text-embedding-3-small, text-embedding-3-large

// Load the Excel file
const workbook = xlsx.readFile('./prod_data/HK PROD 20250121.xlsx');

const sheetNameKna1 = 'kna1';
const worksheetKna1 = workbook.Sheets[sheetNameKna1];
const sheetNameUniversalAddress = 'adrc';
const worksheetUniversal = workbook.Sheets[sheetNameUniversalAddress];

// Convert sheets to JSON, skipping the first row
const dataKna1 = xlsx.utils.sheet_to_json(worksheetKna1, { range: 1, header: 1 });
const dataUniversal = xlsx.utils.sheet_to_json(worksheetUniversal, { range: 1, header: 1 });

let countryKey = ''; // Default country key
// Extract kna1 data
// const kna1Records = dataKna1.map(row => {
const kna1Records = dataKna1
    .filter(row => row[0] && row[0] <= 3000000) // only get 1 and 2 series
    .map(row => {
    if (!row[0] || row[0] > 3000000) return; 

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
        universalRegion: row[49] ? String(row[49]).toLowerCase() : ''         // Region
    };
});

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

    let oneLineAddress = '';
    if (!matchingUniversal) {
        return {
            ...kna1,
            standardAddress: null,
            internationalAddress: null
        };
    } else {
        if (!matchingUniversal || !matchingUniversal.international) return kna1;
        console.log("Country:", kna1.country);
        if (kna1.country == 'cn' || kna1.country == 'tw' || kna1.country == 'hk') {
            oneLineAddress = [
                matchingUniversal.international.universalCity,  // City
                matchingUniversal.international.universalStreet,  // Street
                matchingUniversal.international.universalName  // Name
            ].filter(Boolean).join(' ');
        } else {
            oneLineAddress = [
                matchingUniversal.international.universalStreet,  // Street
                matchingUniversal.international.universalCity,  // City
                matchingUniversal.international.universalPostalCode // House
            ].filter(Boolean).join(' ');
        }
    }
    matchingUniversal.international.universalOneLineAddress = oneLineAddress.toLowerCase()

    return {
        ...kna1,
        internationalAddress: matchingUniversal.international || null, // Previously standard, now renamed to international
        // standardAddress: matchingUniversal.standard || null // Previously international
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

(async () => {
    console.time("Processing time");
    const pineconeIndex = await initializePinecone(pinecone_api_key, vectorIndexName);
    const batchSize = 50; // Maximum number of records to upsert in each batch
    let vectors = [];
    let batchStart = 1;

    console.log("Record count:", records.length);

    for (let i = 0; i < records.length; i++) {
        const record = records[i];

        const allAddresses = [
            { address: record.oneLineAddress, suffix: 'standard' },
            { address: record.internationalAddress?.universalOneLineAddress, suffix: 'international' }
        ];

        for (const { address, suffix } of allAddresses) {
            if (!address) continue; // Skip if the address is null

            const parsedAddress = await getParsedAddress(address);
            let entryNumber = 0;

            if (!Array.isArray(parsedAddress) || parsedAddress.length === 0) {
                console.log(`No parsed address found for record ${record.customer} with address: ${address}`);
                continue;
            }

            for (const entry of parsedAddress) {
                entryNumber++;
                if (entryNumber > 50) break; // Limit to 50 entries per address
                
                if (entry.data) {
                    const embedding = await createEmbedding(entry.data);
                    const sanitizedData = entry.data
                        .replace(/\s+/g, '_')
                        .replace(/[^a-zA-Z0-9_-]/g, '');
                    const embeddingId = `${record.customer}-${sanitizedData}-${suffix}`;

                    if (embeddingId.length > 512) {
                        throw new Error(`Embedding ID exceeds the maximum length of 512 characters.`);
                    }

                    const internationalAddress = record.internationalAddress || {};

                    const vector = {
                        id: embeddingId,
                        values: embedding,
                        metadata: {
                            embedding: entry.data,
                            customer: parseInt(record.customer),
                            country: record.country,
                            international: suffix === 'international',
                            name1: suffix === 'standard' ? record.name1 : internationalAddress.universalName || '',
                            name2: suffix === 'standard' ? record.name2 : internationalAddress.universalName2 || '',
                            city: suffix === 'standard' ? record.city : internationalAddress.universalCity || '',
                            postalCode: suffix === 'standard' ? record.postalCode : internationalAddress.universalPostalCode || '',
                            region: suffix === 'standard' ? record.region : internationalAddress.universalRegion || '',
                            street: suffix === 'standard' ? record.street : internationalAddress.universalStreet || '',
                            houseNumber: suffix === 'standard' ? '' : internationalAddress.universalHouseNumber || '',
                            oneLineAddress: address,
                            parsedAddress: entry.data,
                            searchTerm: record.searchTerm,
                            telephone1: record.telephone1,
                            internationalAddressNumber: suffix === 'international' ? internationalAddress.universalAddressNumber || '' : '',
                            internationalAddressVersion: suffix === 'international' ? internationalAddress.universalAddressVersion || '' : '',
                            internationalConvertedName: suffix === 'international' ? internationalAddress.universalConvertedName || '' : '',
                            internationalCareOfName: suffix === 'international' ? internationalAddress.universalCareOfName || '' : ''
                        }
                    };

                    vectors.push(vector);

                    // Check if batch size is reached
                    if (vectors.length >= batchSize) {
                        await upsert(pineconeIndex, vectorNamespace, vectors);
                        console.log(`Upserted batch of ${vectors.length} vectors from record ${batchStart} to ${i + 1}`);
                        vectors = []; // Reset batch
                        batchStart = i + 1; // Update batch start
                    }
                }
            }
        }
    }

    // Upsert any remaining vectors in the last batch
    if (vectors.length > 0) {
        await upsert(pineconeIndex, vectorNamespace, vectors);
        console.log(`Upserted final batch of ${vectors.length} vectors.`);
    }

    console.log("Data upserted into Pinecone successfully!");
    console.timeEnd("Processing time");
})();

// (async () => {
//     const pineconeIndex = await initializePinecone(pinecone_api_key, vectorIndexName);
//     const batchSize = 50; // approximate number of records to upsert in each batch
//     const vectors = [];
//     let batchStart = 1;
//     const allVectors = [];

//     console.log("record count: ", records.length);
//     for (let i = 0; i < records.length; i++) {
//         const record = records[i];

//         // address_v2 namespace
//         // const parsedAddress = await getParsedAddress(record.oneLineAddress);
//         // const parsedAddressInternational = record.internationalAddress ? await getParsedAddress(record.internationalAddress.universalOneLineAddress) : null; 
//         // for (const entry of parsedAddress) {
//         //     let embedding = null;
//         //     let parsedAddressInternationalEmbedding = null;
            
//         //     if (entry.data) {
//         //         // Use the `data` field from each parsed address to create the embedding
//         //         embedding = await createEmbedding(entry.data);

//         //         const sanitizedData = entry.data
//         //             .replace(/\s+/g, '_')           // Replace spaces with underscores
//         //             .replace(/[^a-zA-Z0-9_-]/g, ''); // Remove non-ASCII characters and keep only letters, numbers, underscores, and hyphens
//         //         const embeddingId = `${record.customer}-${sanitizedData}`;

//         //         // Validate length
//         //         if (embeddingId.length > 512) {
//         //             throw new Error(`Embedding ID exceeds the maximum length of 512 characters.`);
//         //         }
//         //     }

//         //     if (parsedAddressInternational) {
//         //         parsedAddressInternationalEmbedding = await createEmbedding(parsedAddressInternational);
//         //     }

//         //     // Flatten and include internationalAddress metadata
//         //     const internationalAddress = record.internationalAddress || {};
//         //     vectors.push({
//         //         id: embeddingId,
//         //         values: embedding,
//         //         metadata: {
//         //             customer: record.customer,
//         //             country: record.country,
//         //             name1: record.name1,
//         //             name2: record.name2,
//         //             city: record.city,
//         //             postalCode: record.postalCode,
//         //             region: record.region,
//         //             searchTerm: record.searchTerm,
//         //             street: record.street,
//         //             telephone1: record.telephone1,
//         //             faxNumber: record.faxNumber,
//         //             oneTimeAccount: record.oneTimeAccount,
//         //             address: record.address,
//         //             oneLineAddress: record.oneLineAddress,
//         //             parsedAddress: entry.data,

//         //             // International Address flattened metadata
//         //             internationalAddressNumber: internationalAddress.universalAddressNumber || '',
//         //             internationalAddressVersion: internationalAddress.universalAddressVersion || '',
//         //             internationalTitle: internationalAddress.universalTitle || '',
//         //             internationalName: internationalAddress.universalName || '',
//         //             internationalName2: internationalAddress.universalName2 || '',
//         //             internationalName3: internationalAddress.universalName3 || '',
//         //             internationalName4: internationalAddress.universalName4 || '',
//         //             internationalConvertedName: internationalAddress.universalConvertedName || '',
//         //             internationalCareOfName: internationalAddress.universalCareOfName || '',
//         //             internationalCity: internationalAddress.universalCity || '',
//         //             internationalDistrict: internationalAddress.universalDistrict || '',
//         //             internationalPostalCode: internationalAddress.universalPostalCode || '',
//         //             internationalStreet: internationalAddress.universalStreet || '',
//         //             internationalHouseNumber: internationalAddress.universalHouseNumber || '',
//         //             internationalCountryKey: internationalAddress.universalCountryKey || '',
//         //             internationalRegion: internationalAddress.universalRegion || '',
//         //             universalOneLineAddress: internationalAddress.universalOneLineAddress || '',
//         //             universalParsedAddress: parsedAddressInternational ? JSON.stringify(parsedAddressInternational) : ''
//         //         }
//         //     });
//         // }

//         const allAddresses = [
//             { address: record.oneLineAddress, suffix: 'standard' },
//             { address: record.internationalAddress?.universalOneLineAddress, suffix: 'international' }
//         ];

//         const parsedAddress = await getParsedAddress(record.oneLineAddress);
//         const parsedAddressInternational = record.internationalAddress ? await getParsedAddress(record.internationalAddress.universalOneLineAddress) : null; 
        
//         for (const { address, suffix } of allAddresses) {
//             if (!address) continue; // Skip if international address is null
        
//             const parsedAddress = await getParsedAddress(address);
//             let entryNumber = 0;
//             for (const entry of parsedAddress) {
//                 entryNumber++;
//                 if (entryNumber > 50) break; // Limit to 50 entries per address
//                 if (entry.data) {
//                     const embedding = await createEmbedding(entry.data);
//                     const sanitizedData = entry.data
//                         .replace(/\s+/g, '_')
//                         .replace(/[^a-zA-Z0-9_-]/g, '');
//                     const embeddingId = `${record.customer}-${sanitizedData}-${suffix}`;
        
//                     if (embeddingId.length > 512) {
//                         throw new Error(`Embedding ID exceeds the maximum length of 512 characters.`);
//                     }
                    
//                     const internationalAddress = record.internationalAddress || {};
                    
//                     const vector = {
//                         id: embeddingId,
//                         values: embedding,
//                         metadata: {
//                             embedding: entry.data,
//                             // Common metadata
//                             customer: record.customer,
//                             country: record.country,
//                             name1: record.name1,
//                             name2: record.name2,
//                             city: record.city,
//                             postalCode: record.postalCode,
//                             region: record.region,
//                             searchTerm: record.searchTerm,
//                             street: record.street,
//                             telephone1: record.telephone1,
//                             faxNumber: record.faxNumber,
//                             oneTimeAccount: record.oneTimeAccount,
//                             address: record.address,
//                             oneLineAddress: record.oneLineAddress,
//                             parsedAddress: parsedAddress ? JSON.stringify(parsedAddress) : '',

//                             // International Address flattened metadata
//                             internationalAddressNumber: internationalAddress.universalAddressNumber || '',
//                             internationalAddressVersion: internationalAddress.universalAddressVersion || '',
//                             internationalTitle: internationalAddress.universalTitle || '',
//                             internationalName: internationalAddress.universalName || '',
//                             internationalName2: internationalAddress.universalName2 || '',
//                             internationalName3: internationalAddress.universalName3 || '',
//                             internationalName4: internationalAddress.universalName4 || '',
//                             internationalConvertedName: internationalAddress.universalConvertedName || '',
//                             internationalCareOfName: internationalAddress.universalCareOfName || '',
//                             internationalCity: internationalAddress.universalCity || '',
//                             internationalDistrict: internationalAddress.universalDistrict || '',
//                             internationalPostalCode: internationalAddress.universalPostalCode || '',
//                             internationalStreet: internationalAddress.universalStreet || '',
//                             internationalHouseNumber: internationalAddress.universalHouseNumber || '',
//                             internationalCountryKey: internationalAddress.universalCountryKey || '',
//                             internationalRegion: internationalAddress.universalRegion || '',
//                             universalOneLineAddress: internationalAddress.universalOneLineAddress || '',
//                             universalParsedAddress: parsedAddressInternational ? JSON.stringify(parsedAddressInternational) : ''
//                         }
//                     };
//                     vectors.push(vector);
//                     allVectors.push(vector);
//                 }
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

//     console.log("All Vectors:", allVectors);
// })();

// (async () => {
//     const pineconeIndex = await initializePinecone(pinecone_api_key, vectorIndexName);
//     const batchSize = 50; // Maximum number of records to upsert in each batch
//     let vectors = [];
//     let batchStart = 1;
//     const allVectors = [];

//     console.log("Record count:", records.length);
//     for (let i = 0; i < records.length; i++) {
//         const record = records[i];

//         const allAddresses = [
//             { address: record.oneLineAddress, suffix: 'standard' },
//             { address: record.internationalAddress?.universalOneLineAddress, suffix: 'international' }
//         ];

//         const parsedAddress = await getParsedAddress(record.oneLineAddress);
//         const parsedAddressInternational = record.internationalAddress ? await getParsedAddress(record.internationalAddress.universalOneLineAddress) : null; 
        
//         for (const { address, suffix } of allAddresses) {
//             if (!address) continue; // Skip if international address is null
        
//             const parsedAddress = await getParsedAddress(address);
//             let entryNumber = 0;
//             for (const entry of parsedAddress) {
//                 entryNumber++;
//                 if (entryNumber > 50) break; // Limit to 50 entries per address
//                 if (entry.data) {
//                     const embedding = await createEmbedding(entry.data);
//                     const sanitizedData = entry.data
//                         .replace(/\s+/g, '_')
//                         .replace(/[^a-zA-Z0-9_-]/g, '');
//                     const embeddingId = `${record.customer}-${sanitizedData}-${suffix}`;
        
//                     if (embeddingId.length > 512) {
//                         throw new Error(`Embedding ID exceeds the maximum length of 512 characters.`);
//                     }
                    
//                     const internationalAddress = record.internationalAddress || {};
                    
//                     const vector = {
//                         id: embeddingId,
//                         values: embedding,
//                         metadata: {
//                             embedding: entry.data,
//                             // Common metadata
//                             customer: record.customer,
//                             country: record.country,
//                             name1: record.name1,
//                             name2: record.name2,
//                             city: record.city,
//                             postalCode: record.postalCode,
//                             region: record.region,
//                             searchTerm: record.searchTerm,
//                             street: record.street,
//                             telephone1: record.telephone1,
//                             faxNumber: record.faxNumber,
//                             oneTimeAccount: record.oneTimeAccount,
//                             address: record.address,
//                             oneLineAddress: record.oneLineAddress,
//                             parsedAddress: parsedAddress ? JSON.stringify(parsedAddress) : '',

//                             // International Address flattened metadata
//                             internationalAddressNumber: internationalAddress.universalAddressNumber || '',
//                             internationalAddressVersion: internationalAddress.universalAddressVersion || '',
//                             internationalTitle: internationalAddress.universalTitle || '',
//                             internationalName: internationalAddress.universalName || '',
//                             internationalName2: internationalAddress.universalName2 || '',
//                             internationalName3: internationalAddress.universalName3 || '',
//                             internationalName4: internationalAddress.universalName4 || '',
//                             internationalConvertedName: internationalAddress.universalConvertedName || '',
//                             internationalCareOfName: internationalAddress.universalCareOfName || '',
//                             internationalCity: internationalAddress.universalCity || '',
//                             internationalDistrict: internationalAddress.universalDistrict || '',
//                             internationalPostalCode: internationalAddress.universalPostalCode || '',
//                             internationalStreet: internationalAddress.universalStreet || '',
//                             internationalHouseNumber: internationalAddress.universalHouseNumber || '',
//                             internationalCountryKey: internationalAddress.universalCountryKey || '',
//                             internationalRegion: internationalAddress.universalRegion || '',
//                             universalOneLineAddress: internationalAddress.universalOneLineAddress || '',
//                             universalParsedAddress: parsedAddressInternational ? JSON.stringify(parsedAddressInternational) : ''
//                         }
//                     };
//                     vectors.push(vector);
//                     allVectors.push(vector);

//                     if (vectors.length >= batchSize) {
//                         await upsert(pineconeIndex, vectorNamespace, vectors);
//                         console.log(`Upserted batch of ${vectors.length} vectors from record ${batchStart} to ${i + 1}`);
//                         vectors = []; // Reset batch
//                         batchStart = i + 1; // Update batch start
//                     }
//                 }
//             }
//         }    
//     }

//     // Upsert any remaining vectors in the last batch
//     if (vectors.length > 0) {
//         await upsert(pineconeIndex, vectorNamespace, vectors);
//         console.log(`Upserted final batch of ${vectors.length} vectors.`);
//     }

//     console.log("Data upserted into Pinecone successfully!");
// })();

