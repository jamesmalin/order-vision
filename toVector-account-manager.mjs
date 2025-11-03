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
const kna1Records = dataKna1
    .filter(row => row[0] && row[0] >= 9000000)
    .map(row => {
    if (!row[0] || row[0] < 9000000) return; // Skip rows with missing customer or lower than 9000000
    // console.log(row);
    const oneLineAddress = [
        row[8],  // Street
        row[4],  // City
        row[5],  // Postal Code
        row[1]   // Country
    ].filter(Boolean).join(', ');
    // console.log("One Line Address:", oneLineAddress);
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
    // console.log(kna1)
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
        // console.log("Country:", kna1.country);
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

        const allNames = [
            { name: record.name1, suffix: 'standard' },
            { name: record.internationalAddress?.name1, suffix: 'international' }
        ].filter(entry => entry.name);

        for (const { name, suffix } of allNames) {
            if (!name) continue; // Skip if the name is null
            const embedding = await createEmbedding(name);
            const sanitizedData = name
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
                    embedding: name,
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
                    oneLineAddress: name,
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

    // Upsert any remaining vectors in the last batch
    if (vectors.length > 0) {
        await upsert(pineconeIndex, vectorNamespace, vectors);
        console.log(`Upserted final batch of ${vectors.length} vectors.`);
    }

    console.log("Data upserted into Pinecone successfully!");
    console.timeEnd("Processing time");
})();
