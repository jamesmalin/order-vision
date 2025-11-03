// Test file to demonstrate country-specific material ID search functionality
import { searchMaterial } from './search-material.mjs';
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from 'dotenv';

dotenv.config();

const pinecone_api_key = process.env.PINECONE_PROD_API_KEY;
const vectorIndexName = 'materials';
const namespace = 'materials-061625';

async function initializePinecone() {
    const pinecone = new Pinecone({ apiKey: pinecone_api_key });
    const index = pinecone.index(vectorIndexName);
    console.log("Pinecone client and index initialized");
    return index;
}

async function testCountrySpecificSearch() {
    const index = await initializePinecone();
    
    console.log("=== Testing Country-Specific Material ID Search ===\n");
    
    // Test cases
    const testCases = [
        {
            materialId: "849000V",
            country: "br",
            description: "Testing Brazil - should try 849000V and 849000"
        },
        {
            materialId: "849000V",
            country: "us",
            description: "Testing US with Brazil ID - should try 849000 (removing V)"
        },
        {
            materialId: "148CN",
            country: "cn",
            description: "Testing China - should try 148CN and 148"
        },
        {
            materialId: "148CN",
            country: "us",
            description: "Testing US with China ID - should try 148 (removing CN)"
        },
        {
            materialId: "1003102",
            country: null,
            description: "Testing no country - should only try original ID"
        }
    ];
    
    for (const testCase of testCases) {
        console.log(`\n--- ${testCase.description} ---`);
        console.log(`Material ID: ${testCase.materialId}`);
        console.log(`Country: ${testCase.country || 'none'}`);
        
        try {
            const results = await searchMaterial(
                index, 
                null, // no openai for this test
                testCase.materialId, 
                null, // no material description
                false, // no product comparison
                testCase.country
            );
            
            console.log(`Results found: ${results.length}`);
            if (results.length > 0) {
                results.forEach((result, i) => {
                    console.log(`  Result ${i + 1}: ${result.metadata?.material || 'N/A'} - ${result.metadata?.materialDescription || 'No description'}`);
                });
            }
        } catch (error) {
            console.error(`Error in test case: ${error.message}`);
        }
        
        console.log("---");
    }
}

// Run the test
testCountrySpecificSearch().catch(console.error);
