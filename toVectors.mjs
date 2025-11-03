import fs from 'fs';
import { parse } from 'csv-parse';
import OpenAI from 'openai';
import { Pinecone } from "@pinecone-database/pinecone";
import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// Configuration
const USE_MISSING_CUSTOMERS = true; // Set to true to use missing customer numbers from toVectors-missing.json

// Load missing customer numbers if enabled
let onlyThese = [];
if (USE_MISSING_CUSTOMERS) {
    try {
        const missingData = JSON.parse(fs.readFileSync('toVectors-missing.json', 'utf8'));
        onlyThese = missingData.missingCustomerNumbers || [];
        console.log(`Loaded ${onlyThese.length.toLocaleString()} missing customer numbers from toVectors-missing.json`);
    } catch (error) {
        console.error('Error loading toVectors-missing.json:', error.message);
        console.log('Continuing without filtering by missing customers...');
    }
}

// const pinecone_api_key = process.env.PINECONE_API_KEY;
const pinecone_api_key = process.env[`PINECONE_PROD_API_KEY`];
const vectorIndexName = 'addresses'; // addresses, addresses-large
// address_v5_prod_adrc -- US addresses
// address_v5_qa_adrc -- BR addresses
const vectorNamespace = 'address_v7_prod_adrc'; // address_v5_qa_adrc, address_v5_prod_adrc, address_v4_prod_adrc, addresses, name, name_address, address_default, address_v2, address_v3_adrc, address_v3_qa_adrc, address_v3_prod_adrc
const embeddingModel = 'text-embedding-3-small'; // text-embedding-3-small, text-embedding-3-large
const joinRecordsFile = 'joinedRecords-prod-us1-missing.json'; // Output file for joined records

// Load the Excel file
// const workbook = xlsx.readFile('./prod_data/Brazil FUT1 Customers v1.xlsx');

// const sheetNameKna1 = 'kna1';
// const worksheetKna1 = workbook.Sheets[sheetNameKna1];
// const sheetNameUniversalAddress = 'adrc';
// const worksheetUniversal = workbook.Sheets[sheetNameUniversalAddress];

// const onlyThese = [
//     1000135,
//     1081433,
//     2019543,
//     2023749,
//     2096047,
//     2021407,
//     2007495,
//     1000286,
//     2003127,
//     2002714,
//     2003083,
//     2005940,
//     2003019,
//     2001453,
//     2008297,
//     1000156,
//     2000825,
//     2008304,
//     2007138,
//     2008300,
//     2002633,
//     2000970,
//     2008301,
//     2005276,
//     2002663,
//     2000910,
//     1028870,
//     2006531,
//     1013729,
//     2003963,
//     1000288,
//     1004808,
//     2007168,
//     2004486,
//     1061586,
//     2007581,
//     1010013,
//     2125820,
//     2127378,
//     2007578,
//     1064433,
//     1034710,
//     2102538,
//     2006374,
//     2102764,
//     2002732,
//     2087779,
//     2007734,
//     2104630,
//     1035599,
//     2097375,
//     2126702,
//     2005280,
//     2103562,
//     1030964,
//     2104540,
//     1072610,
//     2101685,
//     2011313,
//     1031157,
//     1060870,
//     2025554,
//     1080254,
//     2125114,
//     2090319,
//     2127702,
//     2110002,
//     1008521,
//     2115550,
//     1003436,
//     1029241,
//     2131901,
//     1080321,
//     2010447,
//     2132149,
//     1004014,
//     1090794,
//     1061204,
//     2096357,
//     2008553,
//     2107344,
//     2086817,
//     2005198,
//     2127968,
//     1033531,
//     1074421,
//     1007308,
//     2001083,
//     1028889,
//     2011367,
//     2004209,
//     2001084,
//     1034412,
//     2004133,
//     2001081,
//     2000892,
//     2000893,
//     2001810,
//     2129926,
//     2128319,
//     2000885,
//     2086631,
//     1002886,
//     2005516,
//     1007483,
//     2009236,
//     2009694,
//     2009220,
//     2126425,
//     2009381,
//     2106340,
//     2009222,
//     1007721,
//     2011829,
//     1001890,
//     2009382,
//     2009238,
//     2105360,
//     1004523,
//     2011164,
//     2102234,
//     2088503,
//     2000702,
//     2007879,
//     2001646,
//     2097912,
//     1007900,
//     2007807,
//     2008312,
//     2001125,
//     2088975,
//     2012436,
//     2002385,
//     2001967,
//     1005698,
//     2008062,
//     1003043,
//     1000310,
//     1024867,
//     1007772,
//     2007369,
//     2130101,
//     2003077,
//     2012637,
//     1030026,
//     1011519,
//     2033233,
//     2127633,
//     2130160,
//     1013181,
//     2029074,
//     2025628,
//     1033580,
//     2114658,
//     2021451,
//     2023853,
//     1021108,
//     1033796,
//     1020795,
//     2022300,
//     2025336,
//     2021448,
//     2015630,
//     1023626,
//     2021452,
//     2011106,
//     1023009,
//     1078775,
//     2021446,
//     2027217,
//     2009338,
//     2021449,
//     2029025,
//     2036618,
//     1013221,
//     2024371,
//     2089659,
//     2105583,
//     1034455,
//     2089767,
//     1013921,
//     2009852,
//     1059863,
//     2125275,
//     2009789,
//     2009920,
//     2125817,
//     2009797,
//     2009809,
//     2009913,
//     2009823,
//     1002187,
//     2089804,
//     2009805,
//     2009869,
//     2026844,
//     2009791,
//     2009827,
//     2126359,
//     1018185,
//     2023617,
//     2117131,
//     2126142,
//     1035712,
//     2020043,
//     2117478,
//     2117110,
//     2116467,
//     2020046,
//     2116865,
//     2126131,
//     2125050,
//     2117258,
//     1025734,
//     2092397,
//     2095410,
//     2116999,
//     1020212,
//     2101686,
//     2024703,
//     2022601,
//     2026545,
//     2002687,
//     2094218,
//     1016190,
//     1027989,
//     2024391,
//     1028739,
//     2127986,
//     2004662,
//     2027622,
//     2124665,
//     1010045,
//     2002688,
//     2129387,
//     2023737,
//     1016517,
//     2033391,
//     1088754
//   ].map(String);

// Function to process CSV records in streaming fashion
async function processCSV(kna1Path, adrcPath) {
    // First, read and process ADRC file to build the lookup
    console.log("Processing ADRC file...");
    const universalRecords = {};
    let adrcCount = 0;
    const adrcParser = fs
        .createReadStream(adrcPath)
        .pipe(parse({
            columns: true,
            skip_empty_lines: true
        }));

    for await (const row of adrcParser) {
        adrcCount++;
        if (adrcCount % 1000 === 0) {
            console.error(`  ADRC records processed: ${adrcCount.toLocaleString()}`);
        }
        const record = {
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

        const { universalAddressNumber, universalAddressVersion } = record;
        if (!universalRecords[universalAddressNumber]) {
            universalRecords[universalAddressNumber] = { standard: null, international: null };
        }

        if (universalAddressVersion === 'I') {
            universalRecords[universalAddressNumber].international = record;
        } else {
            universalRecords[universalAddressNumber].standard = record;
        }
    }
    console.error(`ADRC file processed. Total records: ${adrcCount.toLocaleString()}`);

    // Initialize output file
    fs.writeFileSync(joinRecordsFile, '[\n');
    let isFirstRecord = true;

    // Now process KNA1 file and generate results
    console.log("Processing KNA1 file...");
    const kna1Parser = fs
        .createReadStream(kna1Path)
        .pipe(parse({
            columns: true,
            skip_empty_lines: true
        }));

    let processedCount = 0;
    let foundCustomers = new Set();
    let kna1TotalCount = 0;
    const kna1StartTime = Date.now();

    // First pass to count total KNA1 records for progress tracking
    console.error("Counting KNA1 records for progress tracking...");
    const kna1CountParser = fs
        .createReadStream(kna1Path)
        .pipe(parse({
            columns: true,
            skip_empty_lines: true
        }));

    for await (const row of kna1CountParser) {
        // Filter by missing customers if enabled
        if (USE_MISSING_CUSTOMERS && onlyThese.length > 0) {
            if (!row['Customer'] || !onlyThese.includes(row['Customer'])) {
                continue;
            }
        }

        if (
            !row['Customer'] || row['Customer'] > 3000000 
            || !row['Country'] || row['Country'] === 'US'
        ) {
            continue;
        }

        if (row['Central Deletion Flag'] &&
            row['Central Deletion Flag'].trim().toUpperCase() === 'X') {
            continue;
        }

        kna1TotalCount++;
    }
    console.error(`Total KNA1 records to process: ${kna1TotalCount.toLocaleString()}`);

    // Second pass to actually process records
    const kna1ProcessParser = fs
        .createReadStream(kna1Path)
        .pipe(parse({
            columns: true,
            skip_empty_lines: true
        }));

    for await (const row of kna1ProcessParser) {
        // Filter by missing customers if enabled
        if (USE_MISSING_CUSTOMERS && onlyThese.length > 0) {
            if (!row['Customer'] || !onlyThese.includes(row['Customer'])) {
                continue;
            }
        }

        // if (
        //     !row['Customer'] || row['Customer'] > 3000000 
        //     // || !row['Country'] || row['Country'] !== 'US'
        // ) {
        //     continue;
        // }

        // Skip if deletion flag is set
        if (row['Central Deletion Flag'] &&
            row['Central Deletion Flag'].trim().toUpperCase() === 'X') {
            console.log(`Skipping record with Central Deletion Flag: ${row['Customer']}`);
            continue;
        }

        foundCustomers.add(row['Customer']);
        const countryKey = row['Country'] ? String(row['Country']).toLowerCase() : '';
        const kna1 = {
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

        processedCount++;
        const customerKey = kna1.address;
        const matchingUniversal = universalRecords[customerKey];

        // Calculate progress and ETA
        const progressPercent = ((processedCount / kna1TotalCount) * 100).toFixed(1);
        const elapsedTime = Date.now() - kna1StartTime;
        const avgTimePerRecord = elapsedTime / processedCount;
        const remainingRecords = kna1TotalCount - processedCount;
        const estimatedTimeRemaining = avgTimePerRecord * remainingRecords;
        const etaMinutes = Math.round(estimatedTimeRemaining / 60000);

        console.error(`\n[${processedCount}/${kna1TotalCount}] (${progressPercent}%) Processing Customer: ${kna1.customer} | ETA: ${etaMinutes}min`);
        console.log(`   KNA1 Address Key: ${customerKey}`);
        console.log(`   Exists in ADRC?:`, !!matchingUniversal);

        // Process record
        const result = processRecord(kna1, matchingUniversal);

        // Write to file with proper JSON formatting
        const content = (isFirstRecord ? '' : ',\n') + JSON.stringify(result, null, 2);
        await fs.promises.appendFile(joinRecordsFile, content);
        isFirstRecord = false;
    }

    // Close the JSON array
    await fs.promises.appendFile(joinRecordsFile, '\n]');

    const kna1ProcessingTime = ((Date.now() - kna1StartTime) / 1000).toFixed(1);
    console.error(`\n✅ KNA1 Processing Complete!`);
    console.error(`   Processed: ${processedCount.toLocaleString()} records`);
    console.error(`   Time taken: ${kna1ProcessingTime}s`);
    console.error(`   Found customers: ${foundCustomers.size.toLocaleString()}`);
}

// Helper function to process a single record
function processRecord(kna1, matchingUniversal) {
    if (!matchingUniversal) {
        console.log(`No ADRC match found for ${kna1.address}, using KNA1 data.`);
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

    const standardData = matchingUniversal.standard || null;
    const internationalData = matchingUniversal.international?.universalAddressVersion === "I"
        ? matchingUniversal.international
        : null;

    console.log(`Found ADRC Record for ${kna1.address}`);
    console.log(`   Standard Street: ${standardData?.universalStreet || kna1.street}`);
    console.log(`   International Street: ${internationalData?.universalStreet || "N/A"}`);

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
        ].filter(Boolean).join(", ")
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
            ].filter(Boolean).join(", ")
        };
    }

    return result;
}

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

// Process files and create vectors
(async () => {
    console.time("Processing time");
    const pineconeIndex = await initializePinecone(pinecone_api_key, vectorIndexName);
    const batchSize = 50; // Maximum number of records to upsert in each batch
    let vectors = [];
    let batchStart = 1;
    let processedCount = 0;

    // Process CSV files and generate records
    await processCSV('./prod_data/US/kna1_temp.csv', './prod_data/US/adrc_temp.csv');
    // await processCSV('./qa_data/US/kna1_temp.csv', './qa_data/US/adrc_temp.csv');

    // Read the generated JSON file
    const records = JSON.parse(await fs.promises.readFile(joinRecordsFile, 'utf8'));
    console.error(`\n🚀 Starting vector processing for ${records.length.toLocaleString()} records...`);
    
    const vectorStartTime = Date.now();

    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        processedCount++;

        const allAddresses = [
            { address: record.oneLineAddress, suffix: 'standard' },
            { address: record.internationalAddress?.universalOneLineAddress, suffix: 'international' }
        ];

        for (const { address, suffix } of allAddresses) {
            if (!address) continue;

            const parsedAddress = await getParsedAddress(address);
            let entryNumber = 0;

            if (!Array.isArray(parsedAddress) || parsedAddress.length === 0) {
                console.log(`No parsed address found for record ${record.customer} with address: ${address}`);
                continue;
            }

            for (const entry of parsedAddress) {
                entryNumber++;
                if (entryNumber > 10) break;

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
                    const toLower = (str) => str ? str.toLowerCase() : '';
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

        // Enhanced progress logging
        if (processedCount % 5 === 0 || processedCount === records.length) {
            const vectorProgressPercent = ((processedCount / records.length) * 100).toFixed(1);
            const vectorElapsedTime = Date.now() - vectorStartTime;
            const vectorAvgTimePerRecord = vectorElapsedTime / processedCount;
            const vectorRemainingRecords = records.length - processedCount;
            const vectorEstimatedTimeRemaining = vectorAvgTimePerRecord * vectorRemainingRecords;
            const vectorEtaMinutes = Math.round(vectorEstimatedTimeRemaining / 60000);
            
            console.error(`📊 Vector Progress: [${processedCount}/${records.length}] (${vectorProgressPercent}%) | ETA: ${vectorEtaMinutes}min | Vectors created: ${vectors.length + (Math.floor(processedCount/batchSize) * batchSize)}`);
        }
    }

    // Upsert any remaining vectors
    if (vectors.length > 0) {
        await upsert(pineconeIndex, vectorNamespace, vectors);
        console.log(`Upserted final batch of ${vectors.length} vectors.`);
    }

    const totalProcessingTime = ((Date.now() - vectorStartTime) / 1000 / 60).toFixed(1);
    console.error(`\n🎉 Processing Complete!`);
    console.error(`   Total records processed: ${processedCount.toLocaleString()}`);
    console.error(`   Total processing time: ${totalProcessingTime} minutes`);
    console.error(`   Data upserted into Pinecone successfully!`);
    console.timeEnd("Processing time");
})();
