// search.mjs
import { Pinecone } from "@pinecone-database/pinecone";
import dotenv from 'dotenv';
import OpenAI from 'openai';
import axios from "axios";
import natural from 'natural';

dotenv.config();

const pinecone_api_key = process.env.PINECONE_API_KEY;
// note: in testing the small embedding performs better than the large embedding for full addresses
const vectorIndexName = 'addresses'; // addresses, addresses-large
const namespace = 'address_v4_prod_adrc'; // address_default, addresses, name, name_address, address_v2, address_v3_adrc, address_v3_qa_adrc, address_v4_qa_adrc
const resource = 'bio-sf-ai';
const model = 'text-embedding-3-small'; // text-embedding-3-small, text-embedding-3-large
const apiVersion = '2023-07-01-preview';
const openaiApiKey = process.env.AZURE_API_KEY2;

const name = "db - medicina diagnostica ltda - up sorocaba";
const searchText = `rua professor ruy telles miranda, 157`;

// Initialize OpenAI client for embedding generation
const openai = new OpenAI({
    apiKey: openaiApiKey,
    baseURL: `https://${resource}.openai.azure.com/openai/deployments/${model}`,
    defaultQuery: { 'api-version': apiVersion },
    defaultHeaders: { 'api-key': openaiApiKey },
});

// Function to create embedding
async function createEmbedding(input) {
    const embeddingResponse = await openai.embeddings.create({
        model: model,
        input: input,
    });
    return embeddingResponse.data[0].embedding;
}

// Function to initialize Pinecone
async function initializePinecone() {
    const pinecone = new Pinecone({ apiKey: pinecone_api_key });
    const index = pinecone.index(vectorIndexName);
    console.log("Pinecone client and index initialized");
    return index;
}

// Function to search in Pinecone
async function searchPinecone(index, embedding, namespace = '') {
    try {
        const ns = index.namespace(namespace);
        // const filter = { name1: { '$eq': 'ABBOTT LABORATORIES SERVICES LLC' } };
        // const filter = { country: { '$eq': 'TW' }, city: { '$eq': 'New Taipei City' } };
        const filter = {
            // country: { '$ne': 'xyz' },
            country: { '$eq': 'br' },
            // customer: { '$eq': 1100003 }
            // customer: { '$gte': 1000000, '$lt': 2000000 },
            // customer: { '$gte': 2000000, '$lt': 3000000 } 
            // customer: { '$gte': 9000000 }
        };
        const response = await ns.query({
            topK: 3, // Adjust the number of results as needed
            vector: embedding,
            includeMetadata: true,
            includeValues: false,
            filter: filter
        });
        return response.matches;
    } catch (error) {
        console.error("Error searching in Pinecone:", error);
    }
}

async function getParsedAddress(oneLineAddress) {
    try {
        // go rest docker: options: parse
        // rest docker options: parser, expandparser

        const dockerUsed = 'rest'; // go-rest, rest
        const single = true;
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

        if (single && dockerUsed === 'rest') {
            const parsedAddress = (dockerUsed === 'rest')
                ? response.data.find(entry => entry.type === 'expansion')
                : response.data;

            return parsedAddress.data;
        } else {
            return response.data;
        }
    } catch (error) {
        console.error("Error parsing address:", error);
        return null; // Return null if the API call fails
    }
}

// Main function to run search
(async () => {
    // Specify what to search on
    console.log(`Searching for: "${searchText}"`);

    const parsedAddress = await getParsedAddress(searchText);

    console.log(parsedAddress);
    // Generate embedding for the search text
    const embedding = await createEmbedding(searchText.toLowerCase());
    // const embedding = await createEmbedding(parsedAddress);
    
    // Initialize Pinecone index
    const index = await initializePinecone();

    // Perform search
    const results = await searchPinecone(index, embedding, namespace); // Specify namespace if needed

    // // Display search results
    // console.log("Search Results:");
    // results.forEach((result, i) => {
    //     console.log(`Result ${i + 1}:`, result.metadata, "Score:", result.score);
    // });

    console.log(results);

    if (typeof(name) !== 'undefined') {
        // Threshold for similarity
        const threshold = 0.85;

        // Compare query name with each metadata.name1
        const resultsWithSimilarity = results.map(result => {
            const similarity = natural.JaroWinklerDistance(
                name.toLowerCase(),
                result.metadata.name1.toLowerCase()
            );
            return { ...result, similarity };
        });

        // Filter results with similarity above threshold
        const filteredResults = resultsWithSimilarity.filter(result => result.similarity >= threshold);

        // Sort by similarity in descending order
        const sortedResults = filteredResults.sort((a, b) => b.similarity - a.similarity);

        console.log('Closest Matches:', sortedResults);
    }

})();
