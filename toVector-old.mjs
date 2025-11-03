import xlsx from 'xlsx';
import fs from 'fs';
import OpenAI from 'openai';
import { Pinecone } from "@pinecone-database/pinecone";
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const pinecone_api_key = process.env.PINECONE_API_KEY;
const vectorIndexName = 'addresses-large';
const vectorNamespace = 'address_v2_large'; // addresses, name, name_address, address_default, address_v2
const embeddingModel = 'text-embedding-3-large'; // text-embedding-3-small, text-embedding-3-large

// Load the Excel file
const workbook = xlsx.readFile('Taiwan Customers.xlsx');
const sheetName = 'kna1'; // can map kna1 directly with adrc
const worksheet = workbook.Sheets[sheetName];

// Convert sheet to JSON, skipping the first row
const data = xlsx.utils.sheet_to_json(worksheet, { range: 1, header: 1 });

// Extract columns A-M as metadata and generate oneLineAddress
const records = data.map(row => {
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

// Save the JSON to a file
fs.writeFileSync('records.json', JSON.stringify(records, null, 2));

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

        // const parsedAddress = (dockerUsed === 'rest')
        //     ? response.data.find(entry => entry.type === 'expansion')
        //     : response.data;

        // return parsedAddress;

        return response.data;
    } catch (error) {
        console.error("Error parsing address:", error);
        return null; // Return null if the API call fails
    }
}

/** Pinecone and Embedding Functions */
async function createEmbedding(input) {
    const resource = 'bio-sf-ai';
    const model = 'text-embedding-3-small';
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
    const pineconeIndex = await initializePinecone(pinecone_api_key, vectorIndexName);
    const batchSize = 50; // approximate number of records to upsert in each batch
    const vectors = [];
    let batchStart = 1;

    console.log("record count: ", records.length);
    for (let i = 0; i < records.length; i++) {
        const record = records[i];

        // const inputText = `${record.name1}, ${record.name2}, ${record.city}, ${record.country}`;

        if (vectorNamespace !== "address_v2" && vectorNamespace !== "address_v2_large") {
            const parsedAddress = await getParsedAddress(record.oneLineAddress);

            // Convert parsed address object to a string for embedding input
            const parsedAddressText = parsedAddress 
                ? Object.values(parsedAddress).filter(Boolean).join(', ')
                : record.oneLineAddress; // Fallback to oneLineAddress if parsing fails

            let embedding;
            if (vectorNamespace === 'name') {
                embedding = await createEmbedding(record.name1);
            } else if (vectorNamespace === 'address_default') {
                embedding = await createEmbedding(record.oneLineAddress);
            } else if (vectorNamespace === 'name_address') {
                embedding = await createEmbedding(record.name1 + ' ' + parsedAddressText);
            } else {
                embedding = await createEmbedding(parsedAddressText);
            }

            const embeddingId = `${record.customer}`;
            vectors.push({
                id: embeddingId,
                values: embedding,
                metadata: {
                    customer: record.customer,
                    country: record.country,
                    name1: record.name1,
                    name2: record.name2,
                    city: record.city,
                    postalCode: record.postalCode,
                    region: record.region,
                    searchTerm: record.searchTerm,
                    street: record.street,
                    telephone1: record.telephone1,
                    faxNumber: record.faxNumber,
                    oneTimeAccount: record.oneTimeAccount,
                    address: record.address,
                    oneLineAddress: record.oneLineAddress,
                    parsedAddress: parsedAddress ? JSON.stringify(parsedAddress) : ''
                }
            });
        } else {
            // address_v2 namespace
            const parsedAddress = await getParsedAddress(record.oneLineAddress);
            for (const entry of parsedAddress) {
                // Use the `data` field from each parsed address to create the embedding
                const embedding = await createEmbedding(entry.data);

                const sanitizedData = entry.data
                    .replace(/\s+/g, '_')           // Replace spaces with underscores
                    .replace(/[^a-zA-Z0-9_-]/g, ''); // Remove non-ASCII characters and keep only letters, numbers, underscores, and hyphens
                const embeddingId = `${record.customer}-${sanitizedData}`;

                // Validate length
                if (embeddingId.length > 512) {
                throw new Error(`Embedding ID exceeds the maximum length of 512 characters.`);
                }

                vectors.push({
                    id: embeddingId,
                    values: embedding,
                    metadata: {
                    customer: record.customer,
                    country: record.country,
                    name1: record.name1,
                    name2: record.name2,
                    city: record.city,
                    postalCode: record.postalCode,
                    region: record.region,
                    searchTerm: record.searchTerm,
                    street: record.street,
                    telephone1: record.telephone1,
                    faxNumber: record.faxNumber,
                    oneTimeAccount: record.oneTimeAccount,
                    address: record.address,
                    oneLineAddress: record.oneLineAddress,
                    parsedAddress: entry.data
                    }
                });
            }
        }

        // If batch is full or it's the last record, upsert and reset the batch
        // if (vectors.length === batchSize || i === records.length - 1) {
        //     await upsert(pineconeIndex, vectorNamespace, vectors);
        //     console.log(`Upserted batch of ${vectors.length} records`);
        //     vectors.length = 0; // Clear the array for the next batch
        // }
        const batchEnd = i + 1;
        if (vectors.length >= batchSize || i === records.length - 1) {
            await upsert(pineconeIndex, vectorNamespace, vectors);
            console.log(`Upserted batch of ${vectors.length} addresses from record ${batchStart} to ${batchEnd}`);
            
            vectors.length = 0; // Clear the array for the next batch
            batchStart = batchEnd + 1; // Set the start for the next batch
        }
    }

    console.log("Data upserted into Pinecone successfully!");
})();