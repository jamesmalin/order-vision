import xlsx from 'xlsx';
import fs from 'fs';
import OpenAI from 'openai';
import { Pinecone } from "@pinecone-database/pinecone";
import axios from 'axios';
import dotenv from 'dotenv';
import { count } from 'console';
import { kn } from 'date-fns/locale';
dotenv.config();

// const pinecone_api_key = process.env.PINECONE_API_KEY;
const pinecone_api_key = process.env[`PINECONE_PROD_API_KEY`];
const vectorIndexName = 'addresses'; // addresses, addresses-large
// address_v5_prod_adrc -- US addresses
// address_v5_qa_adrc -- BR addresses
const vectorNamespace = 'address_v8_prod_adrc'; // address_v1_E2D, address_v7_prod_adrc, address_v5_qa_adrc, address_v5_prod_adrc, address_v4_prod_adrc, addresses, name, name_address, address_default, address_v2, address_v3_adrc, address_v3_qa_adrc, address_v3_prod_adrc
const embeddingModel = 'text-embedding-3-small'; // text-embedding-3-small, text-embedding-3-large

// Load the Excel file
// const workbook = xlsx.readFile('./prod_data/Brazil FUT1 Customers v1.xlsx');

// const sheetNameKna1 = 'kna1';
// const worksheetKna1 = workbook.Sheets[sheetNameKna1];
// const sheetNameUniversalAddress = 'adrc';
// const worksheetUniversal = workbook.Sheets[sheetNameUniversalAddress];

// Load the Excel files
const workbookKna1 = xlsx.readFile('prod_data/AU NZ HK PROD Customers/kna1.XLSX');
const workbookUniversal = xlsx.readFile('prod_data/AU NZ HK PROD Customers/adrc.XLSX');

const sheetNameKna1 = 'kna1';
const worksheetKna1 = workbookKna1.Sheets[sheetNameKna1];
const sheetNameUniversalAddress = 'adrc';
const worksheetUniversal = workbookUniversal.Sheets[sheetNameUniversalAddress];

const dataKna1 = xlsx.utils.sheet_to_json(worksheetKna1);
const dataUniversal = xlsx.utils.sheet_to_json(worksheetUniversal);

// const onlyThese = [
//     1004808, 2007168, 2004486, 1061586, 2007581,
//     1010013, 2125820, 2127378, 2007578, 1064433,
//     1034710, 2102538, 2006374, 2102764, 2002732,
//     2087779, 2007734, 2104630, 1035599, 2097375,
//     2126702, 2005280, 2103562, 1030964, 2104540,
//     1072610, 2101685, 2011313, 1031157, 1060870,
//     2025554, 1080254, 2125114, 2090319, 2127702,
//     2110002, 1008521, 2115550, 1003436, 1029241,
//     2131901, 1080321, 2010447, 2132149, 1004014,
//     1090794, 1061204, 2096357, 2008553, 2107344,
//     2086817, 2005198, 2127968, 1033531, 1074421
// ].map(String);

const kna1Records = dataKna1
  .filter(row => row['Customer'] && row['Customer'] <= 3000000)
//   .filter(row => row['Customer'] && onlyThese.includes(row['Customer']))
//   .filter(row => row['Country'] && row['Country'] == 'US')
  .map(row => {
    if (row['Central Deletion Flag'] && row['Central Deletion Flag'].trim().toUpperCase() === 'X') {
        console.log(`Skipping record with Central Deletion Flag: ${row['Customer']}`);
        return;
    }

    const countryKey = row['Country'] ? String(row['Country']).toLowerCase() : '';

    return {
      customer: row['Customer'] || '',
      country: countryKey,
      name1: row['Name 1'] || '',
      name2: row['Name 2'] || '',
      city: row['City'] || '',
      postalCode: row['Postal Code'] || '',
      region: row['Region'] || '',
      searchTerm: row['Search term'] || '',
      street: row['Street'] || (row['PO Box'] ? `PO Box ${row['PO Box']}` : ''),
      poBox: row['PO Box'] || '',
      telephone1: row['Telephone 1'] || '',
      faxNumber: row['Fax Number'] || '',
      oneTimeAccount: row['One-time account'] || '',
      address: row['Address'] ? String(row['Address']).trim() : ''
    };
  })
  .filter(Boolean);

console.log(kna1Records.length, "KNA1 records loaded for processing.");

// const universalRecords = dataUniversal.map(row => {
//     return {
//         universalAddressNumber: row[0] ? String(row[0]).trim() : '',
//         universalAddressVersion: row[2] || '',  
//         universalTitle: row[4] || '',  
//         universalName: row[5] || '',  
//         universalName2: row[6] || '',  
//         universalName3: row[7] || '',  
//         universalName4: row[8] || '',  
//         universalConvertedName: row[9] || '',  
//         universalCareOfName: row[10] || '',  
//         universalCity: row[11] || '',  
//         universalDistrict: row[12] || '',  
//         universalPostalCode: row[19] || '',  
//         universalStreet: row[34] || '',  
//         universalStreet2: row[35] || '',  
//         universalHouseNumber: row[38] || '',  
//         universalBuilding: row[40] || '',  
//         universalFloor: row[41] || '',  
//         universalRoom: row[42] || '',  
//         universalCountryKey: row[47] || '',  
//         universalRegion: row[49] || ''  
//     };
// });

const universalRecords = dataUniversal.map(row => {
    return {
      universalAddressNumber: row['Address Number'] ? String(row['Address Number']).trim() : '',
      universalAddressVersion: row['Address Version'] || '',
      universalTitle: row['Title'] || '',
      universalName: row['Name'] || '',
      universalName2: row['Name 2'] || '',
      universalName3: row['Name 3'] || '',
      universalName4: row['Name 4'] || '',
      universalConvertedName: row['Converted name (with form of address)'] || '',
      universalCareOfName: row['c/o name'] || '',
      universalCity: row['City'] || '',
      universalDistrict: row['District'] || '',
      universalPostalCode: row['Postal Code'] || '',
      universalStreet: row['Street'] || (row['PO Box'] ? `PO Box ${row['PO Box']}` : ''),
      universalStreet2: row['Street 2'] || '',
      universalHouseNumber: row['House Number'] || '',
      universalBuilding: row['Building Code'] || '',
      universalFloor: row['Floor'] || '',
      universalRoom: row['Room Number'] || '',
      universalCountryKey: row['Country Key'] || '',
      universalRegion: row['Region'] || ''
    };
  });  


// Step 1: Group universal records by address number
const groupedUniversalRecords = universalRecords.reduce((acc, record) => {
    const { universalAddressNumber, universalAddressVersion } = record;

    if (!acc[universalAddressNumber]) {
        acc[universalAddressNumber] = { standard: null, international: null };
    }

    if (universalAddressVersion === 'I') {
        acc[universalAddressNumber].international = record; 
    } else {
        acc[universalAddressNumber].standard = record; 
    }

    return acc;
}, {});

// Step 2: Map kna1 records and ensure ADRC takes preference
// const records = kna1Records.map(kna1 => {
//     const customerKey = kna1.address;
//     const matchingUniversal = groupedUniversalRecords[customerKey];

//     console.log(`\nProcessing Customer: ${kna1.customer}`);
//     console.log(`   KNA1 Address Key: ${customerKey}`);
//     console.log(`   Exists in ADRC?:`, !!matchingUniversal);
//     console.log(`   Matching Universal Record:`, JSON.stringify(matchingUniversal, null, 2));

//     // Default: No ADRC match, keep only KNA1 data
//     if (!matchingUniversal) {
//         console.log(`No ADRC match found for ${customerKey}, using KNA1 data.`);
//         return {
//             customer: kna1.customer,
//             country: kna1.country,
//             name1: kna1.name1,
//             name2: kna1.name2,
//             building: "", // No match in KNA1
//             floor: "",    // No match in KNA1
//             room: "",     // No match in KNA1
//             suite: "",    // No match in both
//             houseNumber: "", // No match in KNA1
//             city: kna1.city,
//             region: kna1.region,
//             postalCode: kna1.postalCode,
//             street: kna1.street,
//             street2: kna1.street2,
//             poBox: "", // No match in KNA1
//             telephone1: kna1.telephone1,
//             faxNumber: kna1.faxNumber,
//             oneTimeAccount: kna1.oneTimeAccount,
//             address: kna1.address,
//             oneLineAddress: `${kna1.street}, ${kna1.city}, ${kna1.postalCode}, ${kna1.country}`
//         };
//     }

//     // Extract standard and international records if available
//     const standardData = matchingUniversal.standard || null;
//     const internationalData = matchingUniversal.international?.universalAddressVersion === "I"
//         ? matchingUniversal.international
//         : null;

//     console.log(`Found ADRC Record for ${customerKey}`);
//     console.log(`   Standard Street: ${standardData?.universalStreet || kna1.street}`);
//     console.log(`   International Street: ${internationalData?.universalStreet || "N/A"}`);

//     // Merge standard ADRC fields into the main object (without `universal*` prefix)
//     const result = {
//         customer: kna1.customer,
//         country: standardData?.universalCountryKey || kna1.country,
//         name1: standardData?.universalName || kna1.name1,
//         name2: standardData?.universalName2 || kna1.name2,
//         building: standardData?.universalBuilding || "",  
//         floor: standardData?.universalFloor || "",  
//         room: standardData?.universalRoom || "",  
//         suite: "", // No match in both
//         houseNumber: standardData?.universalHouseNumber || "",  
//         city: standardData?.universalCity || kna1.city,
//         region: standardData?.universalRegion || kna1.region,
//         postalCode: standardData?.universalPostalCode || kna1.postalCode,
//         street: standardData?.universalStreet || kna1.street,
//         street2: standardData?.universalStreet2 || "",
//         poBox: "", // No match in both
//         telephone1: kna1.telephone1,
//         faxNumber: kna1.faxNumber,
//         oneTimeAccount: kna1.oneTimeAccount,
//         address: standardData?.universalAddressNumber || kna1.address,
//         oneLineAddress: [
//             standardData?.universalStreet || kna1.street,
//             standardData?.universalCity || kna1.city,
//             standardData?.universalPostalCode || kna1.postalCode,
//             standardData?.universalCountryKey || kna1.country
//         ].filter(Boolean).join(", ")
//     };

//     // If an international address exists, store it separately
//     if (internationalData) {
//         result.internationalAddress = {
//             universalAddressNumber: internationalData.universalAddressNumber,
//             universalAddressVersion: "I",
//             universalTitle: internationalData.universalTitle || "",
//             universalName: internationalData.universalName || "",
//             universalName2: internationalData.universalName2 || "",
//             universalCity: internationalData.universalCity || "",
//             universalDistrict: internationalData.universalDistrict || "",
//             universalPostalCode: internationalData.universalPostalCode || "",
//             universalStreet: internationalData.universalStreet || "",
//             universalHouseNumber: internationalData.universalHouseNumber || "",
//             universalCountryKey: internationalData.universalCountryKey || "",
//             universalRegion: internationalData.universalRegion || "",
//             universalOneLineAddress: [
//                 internationalData.universalCity,
//                 internationalData.universalStreet,
//                 internationalData.universalName
//             ].filter(Boolean).join(" ")
//         };
//     }

//     return result;
// });

const records = kna1Records.map(kna1 => {
    const customerKey = kna1.address;
    const matchingUniversal = groupedUniversalRecords[customerKey];

    console.log(`\nProcessing Customer: ${kna1.customer}`);
    console.log(`   KNA1 Address Key: ${customerKey}`);
    console.log(`   Exists in ADRC?:`, !!matchingUniversal);
    console.log(`   Matching Universal Record:`, JSON.stringify(matchingUniversal, null, 2));

    // Default: No ADRC match, keep only KNA1 data
    if (!matchingUniversal) {
        console.log(`No ADRC match found for ${customerKey}, using KNA1 data.`);
        return {
            customer: kna1.customer,
            country: kna1.country,
            name1: kna1.name1,
            name2: kna1.name2,
            building: "",
            floor: "",
            room: "",
            suite: "",
            houseNumber: "",
            city: kna1.city,
            region: kna1.region,
            postalCode: kna1.postalCode,
            street: kna1.street,
            street2: "",
            poBox: kna1.poBox,
            telephone1: kna1.telephone1,
            faxNumber: kna1.faxNumber,
            oneTimeAccount: kna1.oneTimeAccount,
            address: kna1.address,
            oneLineAddress: [
                kna1.houseNumber, kna1.street, 
                kna1.city, kna1.region, kna1.postalCode, kna1.country
            ].filter(Boolean).join(", ")
        };
    }

    // Extract standard and international records if available
    const standardData = matchingUniversal.standard || null;
    const internationalData = matchingUniversal.international?.universalAddressVersion === "I"
        ? matchingUniversal.international
        : null;

    console.log(`Found ADRC Record for ${customerKey}`);
    console.log(`   Standard Street: ${standardData?.universalStreet || kna1.street}`);
    console.log(`   International Street: ${internationalData?.universalStreet || "N/A"}`);

    // Standardized Address Data
    const result = {
        customer: kna1.customer,
        country: standardData?.universalCountryKey || kna1.country,
        name1: standardData?.universalName || kna1.name1,
        name2: standardData?.universalName2 || kna1.name2,
        building: standardData?.universalBuilding || "",  
        floor: standardData?.universalFloor || "",  
        room: standardData?.universalRoom || "",  
        suite: "", 
        houseNumber: standardData?.universalHouseNumber || "",  
        city: standardData?.universalCity || kna1.city,
        region: standardData?.universalRegion || kna1.region,
        postalCode: standardData?.universalPostalCode || kna1.postalCode,
        street: standardData?.universalStreet || kna1.street,
        street2: standardData?.universalStreet2 || "",
        poBox: kna1.poBox,
        telephone1: kna1.telephone1,
        faxNumber: kna1.faxNumber,
        oneTimeAccount: kna1.oneTimeAccount,
        address: standardData?.universalAddressNumber || kna1.address,
        oneLineAddress: [
            standardData?.universalHouseNumber || "", 
            standardData?.universalStreet || kna1.street,
            standardData?.universalStreet2 || "",
            standardData?.universalCity || kna1.city,
            standardData?.universalRegion || kna1.region,
            standardData?.universalPostalCode || kna1.postalCode,
            standardData?.universalCountryKey || kna1.country
        ].filter(Boolean).join(", "),        
    };

    if (internationalData) {
        result.internationalAddress = {
            universalAddressNumber: internationalData.universalAddressNumber,
            universalAddressVersion: "I",
            universalTitle: internationalData.universalTitle || "",
            universalName: internationalData.universalName || "",
            universalName2: internationalData.universalName2 || "",
            universalCity: internationalData.universalCity || "",
            universalDistrict: internationalData.universalDistrict || "",
            universalPostalCode: internationalData.universalPostalCode || "",
            universalStreet: internationalData.universalStreet || "",
            universalHouseNumber: internationalData.universalHouseNumber || "",
            universalCountryKey: internationalData.universalCountryKey || "",
            universalRegion: internationalData.universalRegion || "",
            universalOneLineAddress: [
                internationalData?.universalHouseNumber || "", 
                internationalData?.universalStreet || "",
                internationalData?.universalStreet2 || "",
                internationalData?.universalCity || "",
                internationalData?.universalRegion || "",
                internationalData?.universalPostalCode || "",
                internationalData?.universalCountryKey || ""
            ].filter(Boolean).join(", "),
        };
    }

    return result;
});


// Log to verify
console.log(records);

// Save the joined JSON to a file
fs.writeFileSync('joinedRecords-prod-us1.json', JSON.stringify(records, null, 2));

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
            // throw error; // Re-throw the error to handle it in the calling function
        }
    }
}

// (async () => {
//     console.time("Processing time");
//     const pineconeIndex = await initializePinecone(pinecone_api_key, vectorIndexName);
//     const batchSize = 50; // Maximum number of records to upsert in each batch
//     let vectors = [];
//     let batchStart = 1;

//     console.log("Record count:", records.length);

//     for (let i = 0; i < records.length; i++) {
//         const record = records[i];

//         const allAddresses = [
//             { address: record.oneLineAddress, suffix: 'standard' },
//             { address: record.internationalAddress?.universalOneLineAddress, suffix: 'international' }
//         ];

//         for (const { address, suffix } of allAddresses) {
//             if (!address) continue; // Skip if the address is null

//             const parsedAddress = await getParsedAddress(address);
//             let entryNumber = 0;

//             if (!Array.isArray(parsedAddress) || parsedAddress.length === 0) {
//                 console.log(`No parsed address found for record ${record.customer} with address: ${address}`);
//                 continue;
//             }

//             for (const entry of parsedAddress) {
//                 entryNumber++;
//                 // if (entryNumber > 50) break; // Limit to 50 entries per address
//                 if (entryNumber > 10) break; // Limit to 10 entries per address
                
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
//                             customer: parseInt(record.customer),
//                             country: record.country,
//                             international: suffix === 'international',
//                             name1: suffix === 'standard' ? record.name1 : internationalAddress.universalName || '',
//                             name2: suffix === 'standard' ? record.name2 : internationalAddress.universalName2 || '',
//                             city: suffix === 'standard' ? record.city : internationalAddress.universalCity || '',
//                             postalCode: suffix === 'standard' ? record.postalCode : internationalAddress.universalPostalCode || '',
//                             region: suffix === 'standard' ? record.region : internationalAddress.universalRegion || '',
//                             street: suffix === 'standard' ? record.street : internationalAddress.universalStreet || '',
//                             houseNumber: suffix === 'standard' ? '' : internationalAddress.universalHouseNumber || '',
//                             oneLineAddress: address,
//                             parsedAddress: entry.data,
//                             searchTerm: record.searchTerm,
//                             telephone1: record.telephone1,
//                             internationalAddressNumber: suffix === 'international' ? internationalAddress.universalAddressNumber || '' : '',
//                             internationalAddressVersion: suffix === 'international' ? internationalAddress.universalAddressVersion || '' : '',
//                             internationalConvertedName: suffix === 'international' ? internationalAddress.universalConvertedName || '' : '',
//                             internationalCareOfName: suffix === 'international' ? internationalAddress.universalCareOfName || '' : ''
//                         }
//                     };

//                     vectors.push(vector);

//                     // Check if batch size is reached
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
//     console.timeEnd("Processing time");
// })();

(async () => {
    console.time("Processing time");
    const pineconeIndex = await initializePinecone(pinecone_api_key, vectorIndexName);
    const batchSize = 50; // Maximum number of records to upsert in each batch
    let vectors = [];
    let batchStart = 1;
    let processedCount = 0;

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
                // if (entryNumber > 50) break; // Limit to 50 entries per address
                if (entryNumber > 10) break; // Limit to 10 entries per address
                
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

                    // Helper function to safely convert string to lowercase
                    const toLower = (str) => str ? str.toLowerCase() : '';

                    // Helper function to get address field value
                    const getField = (standardField, universalField) => {
                        return toLower(suffix === 'standard' ? standardField : universalField);
                    };

                    const vector = {
                        id: embeddingId,
                        values: embedding,
                        metadata: {
                            embedding: toLower(entry.data),
                            customer: parseInt(record.customer),
                            country: record.country.toUpperCase(),
                            international: suffix === 'international',
                            name1: getField(record.name1, internationalAddress.universalName),
                            name2: getField(record.name2, internationalAddress.universalName2),
                            building: getField(record.building, internationalAddress.universalBuilding),
                            floor: getField(record.floor, internationalAddress.universalFloor),
                            room: getField(record.room, internationalAddress.universalRoom),
                            suite: toLower(record.suite),
                            city: getField(record.city, internationalAddress.universalCity),
                            postalcode: getField(record.postalCode, internationalAddress.universalPostalCode),
                            region: getField(record.region, internationalAddress.universalRegion),
                            street: getField(record.street, internationalAddress.universalStreet),
                            street2: getField(record.street2, internationalAddress.universalStreet2),
                            housenumber: getField(record.houseNumber, internationalAddress.universalHouseNumber),
                            pobox: toLower(record.poBox),
                            onelineaddress: toLower(address),
                            parsedaddress: toLower(entry.data),
                            searchterm: toLower(record.searchTerm),
                            telephone1: toLower(record.telephone1),
                            internationaladdressnumber: suffix === 'international' ? toLower(internationalAddress.universalAddressNumber) : '',
                            internationaladdressversion: suffix === 'international' ? toLower(internationalAddress.universalAddressVersion) : '',
                            internationalconvertedname: suffix === 'international' ? toLower(internationalAddress.universalConvertedName) : '',
                            internationalcareofname: suffix === 'international' ? toLower(internationalAddress.universalCareOfName) : ''
                        }
                    };

                    vectors.push(vector);

                    // console.log(vectors);

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

        // Increment and log progress
        processedCount++;
        if (processedCount % 10 === 0) {
            console.log(`Processed ${processedCount}/${records.length} records`);
        }
    }

    // Upsert any remaining vectors in the last batch
    if (vectors.length > 0) {
        await upsert(pineconeIndex, vectorNamespace, vectors);
        console.log(`Upserted final batch of ${vectors.length} vectors.`);
    }

    console.log(`Total records processed: ${processedCount}`);
    console.log("Data upserted into Pinecone successfully!");
    console.timeEnd("Processing time");
})();
