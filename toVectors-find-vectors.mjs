import { Pinecone } from "@pinecone-database/pinecone";
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

// Configuration from toVectors.mjs
const pinecone_api_key = process.env[`PINECONE_PROD_API_KEY`];
const vectorIndexName = 'addresses'; // addresses, addresses-large
const vectorNamespace = 'address_v7_prod_adrc'; // address_v5_qa_adrc, address_v5_prod_adrc, address_v4_prod_adrc, addresses, name, name_address, address_default, address_v2, address_v3_adrc, address_v3_qa_adrc, address_v3_prod_adrc

async function initializePinecone(pineconeApiKey, indexName) {
    const pinecone = new Pinecone({
        apiKey: pineconeApiKey
    });
    const index = pinecone.index(indexName);
    console.log("Pinecone client and index initialized");
    return index;
}

async function listAndExportVectors(index, namespace, outputFile) {
    try {
        const ns = index.namespace(namespace);
        console.log(`Starting to list all vectors from namespace: ${namespace}`);
        
        let allVectors = [];
        let totalVectors = 0;
        let paginationToken = undefined;
        let batchCount = 0;
        
        // First, get all vector IDs
        do {
            console.log(`Fetching vector IDs batch ${batchCount + 1}...`);
            
            const listResponse = await ns.listPaginated({
                limit: 100, // Maximum allowed per request
                paginationToken: paginationToken
            });
            
            if (listResponse.vectors && listResponse.vectors.length > 0) {
                console.log(`Found ${listResponse.vectors.length} vector IDs in batch ${batchCount + 1}`);
                
                // Just add the vector IDs directly to our collection
                allVectors.push(...listResponse.vectors);
                
                // Write to file every 100 vectors
                if (allVectors.length >= 100) {
                    await writeVectorBatch(outputFile, allVectors, totalVectors === 0);
                    totalVectors += allVectors.length;
                    console.log(`    Written ${allVectors.length} vector IDs to file (Total: ${totalVectors.toLocaleString()})`);
                    allVectors = []; // Clear the batch
                }
            }
            
            paginationToken = listResponse.pagination?.next;
            batchCount++;
            
            // Progress update every 10 batches
            if (batchCount % 10 === 0) {
                console.log(`🔄 Progress: ${batchCount} ID batches processed, ${totalVectors.toLocaleString()} full vectors exported so far...`);
            }
            
        } while (paginationToken);
        
        // Write any remaining vectors
        if (allVectors.length > 0) {
            await writeVectorBatch(outputFile, allVectors, totalVectors === 0);
            totalVectors += allVectors.length;
            console.log(`    Written final ${allVectors.length} vectors to file`);
        }
        
        // Finalize the JSON file
        await finalizeJsonFile(outputFile, totalVectors);
        
        console.log(`\nCompleted listing all vectors. Total found: ${totalVectors.toLocaleString()}`);
        return totalVectors;
        
    } catch (error) {
        console.error("Error listing vectors:", error);
        if (error.response) {
            console.error("Response data:", error.response.data);
        }
        throw error;
    }
}

async function writeVectorBatch(outputFile, vectors, isFirstBatch) {
    if (isFirstBatch) {
        // Initialize the JSON file with opening structure
        const header = {
            exportInfo: {
                timestamp: new Date().toISOString(),
                indexName: vectorIndexName,
                namespace: vectorNamespace,
                totalVectors: "TO_BE_UPDATED"
            },
            vectors: vectors
        };
        await fs.promises.writeFile(outputFile, JSON.stringify(header, null, 2));
        console.log(`✅ Created ${outputFile} with ${vectors.length} vectors`);
    } else {
        // Read existing file, parse it, add new vectors, and write back
        const existingContent = await fs.promises.readFile(outputFile, 'utf8');
        const data = JSON.parse(existingContent);
        data.vectors.push(...vectors);
        
        // Write back with proper formatting
        const jsonString = JSON.stringify(data, null, 2);
        await fs.promises.writeFile(outputFile, jsonString);
        console.log(`✅ Added ${vectors.length} vectors to ${outputFile}`);
    }
}

async function finalizeJsonFile(outputFile, totalCount) {
    const fileContent = await fs.promises.readFile(outputFile, 'utf8');
    const updatedContent = fileContent.replace('"totalVectors": "TO_BE_UPDATED"', `"totalVectors": ${totalCount}`);
    await fs.promises.writeFile(outputFile, updatedContent);
}

async function exportVectors() {
    try {
        console.log("🚀 Starting vector export process...");
        console.log(`Index: ${vectorIndexName}`);
        console.log(`Namespace: ${vectorNamespace}`);
        console.log("⚠️  Processing 1.3M+ records - writing to file after each batch to prevent memory issues");
        
        // Initialize Pinecone
        const pineconeIndex = await initializePinecone(pinecone_api_key, vectorIndexName);
        
        // Output file
        const outputFile = 'toVectors-full-export.json';
        console.log(`\n💾 Starting streaming export to ${outputFile}...`);
        
        // List and export vectors with streaming writes
        const totalVectors = await listAndExportVectors(pineconeIndex, vectorNamespace, outputFile);
        
        if (totalVectors === 0) {
            console.log("No vectors found in the specified namespace.");
            return;
        }
        
        console.log(`\n✅ Export completed successfully!`);
        console.log(`   File: ${outputFile}`);
        console.log(`   Total vectors exported: ${totalVectors.toLocaleString()}`);
        console.log(`   Index: ${vectorIndexName}`);
        console.log(`   Namespace: ${vectorNamespace}`);
        
        // Get file size for reference
        const stats = await fs.promises.stat(outputFile);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        console.log(`   File size: ${fileSizeMB} MB`);
        
    } catch (error) {
        console.error("❌ Error during export:", error);
        process.exit(1);
    }
}

// Run the export
(async () => {
    console.time("Export time");
    await exportVectors();
    console.timeEnd("Export time");
})();
