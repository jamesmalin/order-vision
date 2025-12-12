// find-materials-ending-v.mjs
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const pinecone_api_key = process.env.PINECONE_PROD_API_KEY;
const vectorIndexName = 'materials';
const namespace = 'materials-061625';

// Function to initialize Pinecone
async function initializePinecone() {
    const pinecone = new Pinecone({ apiKey: pinecone_api_key });
    const index = pinecone.index(vectorIndexName);
    console.log("Pinecone client and index initialized");
    return index;
}

// Function to fetch all materials from Pinecone
async function fetchAllMaterials(index, namespace) {
    try {
        const ns = index.namespace(namespace);
        console.log("Fetching all materials from Pinecone...");
        
        // Query with a zero vector to get all materials
        // We'll need to paginate through results
        const allMaterials = new Map(); // Use Map to deduplicate by material ID
        let paginationToken = null;
        let totalFetched = 0;
        
        do {
            const queryParams = {
                topK: 10000, // Maximum allowed per query
                vector: new Array(1536).fill(0),
                includeMetadata: true,
                includeValues: false
            };
            
            if (paginationToken) {
                queryParams.paginationToken = paginationToken;
            }
            
            const response = await ns.query(queryParams);
            
            // Process matches
            response.matches.forEach(match => {
                if (match.metadata && match.metadata.material) {
                    const materialId = match.metadata.material;
                    // Only add if not already in map (to avoid duplicates)
                    if (!allMaterials.has(materialId)) {
                        allMaterials.set(materialId, match.metadata);
                    }
                }
            });
            
            totalFetched += response.matches.length;
            console.log(`Fetched ${totalFetched} vectors so far, ${allMaterials.size} unique materials...`);
            
            // Check if there are more results
            paginationToken = response.pagination?.next;
            
        } while (paginationToken);
        
        console.log(`Total unique materials fetched: ${allMaterials.size}`);
        return Array.from(allMaterials.values());
        
    } catch (error) {
        console.error("Error fetching materials from Pinecone:", error);
        return [];
    }
}

// Function to filter materials ending with 'V'
function filterMaterialsEndingWithV(materials) {
    return materials.filter(material => {
        const materialId = material.material?.toString() || '';
        return materialId.endsWith('V');
    });
}

// Function to convert materials to CSV
function materialsToCSV(materials) {
    if (materials.length === 0) {
        return 'No materials found ending with V';
    }
    
    // Get all unique keys from all materials to create comprehensive headers
    const allKeys = new Set();
    materials.forEach(material => {
        Object.keys(material).forEach(key => allKeys.add(key));
    });
    
    const headers = Array.from(allKeys).sort();
    
    // Create CSV header
    const csvRows = [];
    csvRows.push(headers.join(','));
    
    // Create CSV rows
    materials.forEach(material => {
        const row = headers.map(header => {
            const value = material[header];
            // Handle values that might contain commas or quotes
            if (value === null || value === undefined) {
                return '';
            }
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
        });
        csvRows.push(row.join(','));
    });
    
    return csvRows.join('\n');
}

// Main function
async function main() {
    try {
        console.log("Starting search for materials ending with 'V'...\n");
        
        // Initialize Pinecone
        const index = await initializePinecone();
        
        // Fetch all materials
        console.log("\nFetching all materials from namespace:", namespace);
        const allMaterials = await fetchAllMaterials(index, namespace);
        console.log(`Total materials fetched: ${allMaterials.length}\n`);
        
        // Filter materials ending with 'V'
        console.log("Filtering materials ending with 'V'...");
        const materialsEndingWithV = filterMaterialsEndingWithV(allMaterials);
        console.log(`Found ${materialsEndingWithV.length} materials ending with 'V'\n`);
        
        if (materialsEndingWithV.length > 0) {
            // Display first few results
            console.log("Sample of materials ending with 'V':");
            materialsEndingWithV.slice(0, 10).forEach((material, index) => {
                console.log(`${index + 1}. ${material.material} - ${material.materialDescription || 'No description'}`);
            });
            
            // Convert to CSV
            console.log("\nGenerating CSV...");
            const csv = materialsToCSV(materialsEndingWithV);
            
            // Save to file
            const filename = 'materials-ending-with-v.csv';
            fs.writeFileSync(filename, csv);
            console.log(`\nCSV file created: ${filename}`);
            console.log(`Total materials in CSV: ${materialsEndingWithV.length}`);
            
            // Also save as JSON for reference
            const jsonFilename = 'materials-ending-with-v.json';
            fs.writeFileSync(jsonFilename, JSON.stringify(materialsEndingWithV, null, 2));
            console.log(`JSON file created: ${jsonFilename}`);
        } else {
            console.log("No materials ending with 'V' were found.");
        }
        
    } catch (error) {
        console.error("Error in main function:", error);
        process.exit(1);
    }
}

// Run the script
main();
