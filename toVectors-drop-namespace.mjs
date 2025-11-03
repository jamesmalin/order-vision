import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from 'dotenv';
dotenv.config();

// Pinecone configuration
const pinecone_api_key = process.env[`PINECONE_PROD_API_KEY`];
const vectorIndexName = 'addresses'; // addresses, addresses-large
const vectorNamespace = 'address_v1_E2D'; // Namespace to drop/delete vectors from

console.log(`Initializing Pinecone connection...`);
console.log(`Index: ${vectorIndexName}`);
console.log(`Namespace: ${vectorNamespace}`);

/** Pinecone Functions */
async function initializePinecone(pineconeApiKey, indexName) {
    const pinecone = new Pinecone({
        apiKey: pineconeApiKey
    });
    const index = pinecone.index(indexName);
    console.log("Pinecone client and index initialized");
    return index;
}

async function deleteAllVectorsInNamespace(index, namespace) {
    try {
        const ns = index.namespace(namespace);
        
        // Delete all vectors in the namespace
        const deleteResponse = await ns.deleteAll();
        
        console.log(`Successfully deleted all vectors in namespace: ${namespace}`);
        return deleteResponse;
    } catch (error) {
        if (error.response) {
            console.error("Pinecone Error:", error.response.data);
        } else {
            console.error("Error making Pinecone API call:", error.message);
        }
        throw error;
    }
}

async function getNamespaceStats(index, namespace) {
    try {
        const ns = index.namespace(namespace);
        const stats = await index.describeIndexStats();
        
        console.log("Index Stats:", JSON.stringify(stats, null, 2));
        
        if (stats.namespaces && stats.namespaces[namespace]) {
            console.log(`Namespace '${namespace}' contains ${stats.namespaces[namespace].vectorCount} vectors`);
            return stats.namespaces[namespace].vectorCount;
        } else {
            console.log(`Namespace '${namespace}' not found or is empty`);
            return 0;
        }
    } catch (error) {
        console.error("Error getting namespace stats:", error.message);
        throw error;
    }
}

// Main execution
(async () => {
    try {
        console.time("Drop namespace processing time");
        
        // Initialize Pinecone
        const pineconeIndex = await initializePinecone(pinecone_api_key, vectorIndexName);
        
        // Get stats before deletion
        console.log("\n=== BEFORE DELETION ===");
        const vectorCountBefore = await getNamespaceStats(pineconeIndex, vectorNamespace);
        
        if (vectorCountBefore === 0) {
            console.log("Namespace is already empty or doesn't exist. Nothing to delete.");
            return;
        }
        
        // Confirm deletion (in production, you might want to add a confirmation prompt)
        console.log(`\n⚠️  WARNING: About to delete ALL ${vectorCountBefore} vectors in namespace '${vectorNamespace}'`);
        console.log("This action cannot be undone!");
        
        // Uncomment the following lines to add a confirmation prompt
        // const readline = require('readline');
        // const rl = readline.createInterface({
        //     input: process.stdin,
        //     output: process.stdout
        // });
        // 
        // const confirmation = await new Promise(resolve => {
        //     rl.question('Type "DELETE" to confirm: ', resolve);
        // });
        // rl.close();
        // 
        // if (confirmation !== 'DELETE') {
        //     console.log('Deletion cancelled.');
        //     return;
        // }
        
        // Proceed with deletion
        console.log("\n=== STARTING DELETION ===");
        await deleteAllVectorsInNamespace(pineconeIndex, vectorNamespace);
        
        // Wait a moment for the deletion to propagate
        console.log("Waiting for deletion to propagate...");
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Get stats after deletion
        console.log("\n=== AFTER DELETION ===");
        const vectorCountAfter = await getNamespaceStats(pineconeIndex, vectorNamespace);
        
        console.log(`\n✅ Deletion completed successfully!`);
        console.log(`Vectors before: ${vectorCountBefore}`);
        console.log(`Vectors after: ${vectorCountAfter}`);
        
        console.timeEnd("Drop namespace processing time");
        
    } catch (error) {
        console.error("❌ Error during namespace deletion:", error.message);
        process.exit(1);
    }
})();
