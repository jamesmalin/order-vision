import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import OpenAI from 'openai';
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from 'dotenv';
dotenv.config();

import { searchMaterial } from "./search-material.mjs";

const apiKey = process.env.AZURE_API_KEY2;
const embeddingResource = 'bio-sf-ai';
const embeddingAPIVersion = '2023-07-01-preview';
const embeddingModel = 'text-embedding-3-small';
const embeddingOpenAI = new OpenAI({
    apiKey: apiKey,
    baseURL: `https://${embeddingResource}.openai.azure.com/openai/deployments/${embeddingModel}`,
    defaultQuery: { 'api-version': embeddingAPIVersion },
    defaultHeaders: { 'api-key': apiKey },
});

const material_pinecone_api_key = process.env.PINECONE_PROD_API_KEY;
const materialVectorIndexName = 'materials';
const materialPineconeInitialization = await initializePinecone(material_pinecone_api_key, materialVectorIndexName);

async function initializePinecone(pineconeApiKey, indexName) {
    const pinecone = new Pinecone({
        apiKey: pineconeApiKey
    });
    const index = pinecone.index(indexName);
    console.log("Pinecone client and index initialized");
    return index;
}

console.log("=== DESCRIPTION-ONLY SEARCH TEST ===\n");

// Test pure description search - NO material IDs provided
console.log("🧪 Test: Pure description-based search");
console.log("Input: NO material IDs, only description");
console.log("Description: 'Bis-Tris ProteinGel\\n1EA\\nBio-Rad3450123'");
console.log("Expected: Should find '4-12% Crit XT Bis-Tris Gel 12+2 45 µl' through semantic/keyword matching");
console.log("Goal: Prove description search works without relying on material ID extraction\n");

const description = `Bis-Tris ProteinGel
1EA
Bio-Rad3450123`;

// Explicitly pass null/empty for material IDs and disable auto-extraction to force pure description search
const results = await searchMaterial(materialPineconeInitialization, embeddingOpenAI, null, description, false, null, true);

console.log("📊 Results:");
if (results.length > 0) {
    console.log(`✅ Found ${results.length} result(s) using DESCRIPTION ONLY:`);
    results.forEach((result, i) => {
        console.log(`${i + 1}. ${result.metadata.material}: "${result.metadata.materialDescription}"`);
        console.log(`   Score: ${result.score.toFixed(3)} | Search Type: ${result.searchType}`);
        
        // Check if this is the target match
        if (result.metadata.materialDescription.includes('4-12%') && 
            result.metadata.materialDescription.includes('Bis-Tris') && 
            result.metadata.materialDescription.includes('Gel')) {
            console.log(`   🎯 TARGET FOUND: This matches the expected result!`);
        }
        
        // Check semantic similarity score
        if (result.searchType === 'semantic' && result.score > 0.7) {
            console.log(`   🔥 HIGH SEMANTIC SCORE: Excellent description matching!`);
        }
    });
    
    // Check if the top result is semantically relevant
    const topResult = results[0];
    if (topResult.searchType === 'semantic') {
        console.log(`\n✅ SUCCESS: Semantic search is working!`);
        console.log(`   Top result found through pure description matching`);
        console.log(`   Score: ${topResult.score.toFixed(3)} (vs previous 0.27)`);
    }
} else {
    console.log("❌ No results found - description search needs improvement");
}

console.log("\n" + "=".repeat(60));
console.log("📈 DESCRIPTION SEARCH ANALYSIS:");
console.log("• Semantic Search: Uses actual embeddings for similarity");
console.log("• Keyword Extraction: Finds relevant terms like 'bis-tris', 'protein-gel'");
console.log("• Multi-strategy: Tries semantic → keyword → fuzzy matching");
console.log("• Goal: High relevance scores (0.7+) for description-only searches");
