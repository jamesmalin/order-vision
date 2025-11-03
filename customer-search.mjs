import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
// import { AzureKeyCredential, DocumentAnalysisClient } from "@azure/ai-form-recognizer";
import DocumentIntelligence, { getLongRunningPoller, isUnexpected } from "@azure-rest/ai-document-intelligence";
import fs from "fs";
import OpenAI from 'openai';
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { Pinecone } from "@pinecone-database/pinecone";
import axios, { all } from 'axios';
import dotenv from 'dotenv';
dotenv.config();

import { formatDates } from "./format-dates.mjs";
import { translateText  } from "./translate.mjs";
import { searchMaterial } from "./search-material.mjs";
import { extractMaterials } from './extract-materials.mjs';
import { searchAccountManager } from "./search-accountmanager.mjs";
import { addressSearch } from "./search.mjs";
// import { searchCustomer } from "./search-customer.mjs";
// import { checkKNVP } from "./knvp-check.mjs";
import natural from 'natural';

import PriceCalculator from 'ai-calc';
import { match } from "assert";
const priceCalculator = new PriceCalculator();
const aiModel = "gpt-4-1106-preview"; // gpt-4-1106-preview, gpt-4o, o1-mini

const AWS = process.env.AWS === 'true';
const Azure = process.env.AZURE === 'true';

const pinecone_api_key = process.env.PINECONE_API_KEY;
const vectorIndexName = 'addresses';
const vectorNamespace = process.env.NAMESPACE || "address_v4_prod_adrc"; // address_default, addresses, name, name_address, address_v2, address_v3_adrc, address_v3_qa_adrc, address_v4_qa_adrc

const target = "en-US";

// Helper function to set translated name
export async function setTranslatedName(entity, fallbackName) {
    if (!entity.name) {
        entity.name = fallbackName.name || ""; // Assign fallbackName.name or an empty string if neither exists
        entity.translatedName = fallbackName.translatedName || entity.name; // Use fallback translatedName or entity.name
    } else {
        if (!entity.name_english) {
            const translated = await translateText({ text: entity.name }, target);
            entity.translatedName = translated?.translations[0]?.translatedText ?? entity.name;
        } else {
            entity.translatedName = entity.name_english;
        }
    }
    if (!entity.address) {
        entity.name = fallbackName.address || ""; // Assign fallbackName.name or an empty string if neither exists
        entity.translatedAddress = fallbackName.translatedAddress || entity.address; // Use fallback translatedName or entity.name
    } else {
        const translated = await translateText({ text: entity.address }, target);
        entity.translatedAddress = translated?.translations[0]?.translatedText ?? entity.address;
    }
}    

/**
 * Get customer information based on various parameters.
 * @param {Object} initialize - Initialized Pinecone index.
 * @param {string} type - Type of customer (sold_to, ship_to, consignee).
 * @param {Object} aiResponse - AI response object.
 * @param {string} name - Customer name.
 * @param {string} address - Customer address.
 * @param {string} street - Customer street.
 * @param {string} city - Customer city.
 * @param {string} postalCode - Customer postal code.
 * @param {string} country - Customer country.
 * @param {Array} addressArray - Array of addresses.
 * @param {string|null} seriesFallback - Series fallback.
 * @param {string|null} sold_toAddress - Sold to address.
 * @param {string|null} otherAddress - Other address.
 * @returns {Array} Filtered and ordered results.
 */
export async function getCustomer(initialize, type, aiResponse, name, translatedName, address, street, city, postalCode, country, addressArray, seriesFallback = null, sold_toAddress = null, otherAddress = null) {
    console.log("name", name);
    console.log("translated name: ", translatedName);
    console.log("address", address);
    console.log("city", city);
    console.log("postalCode", postalCode);
    console.log("country", country);

    if (!address) return "";
    
    const parsedAddress = await getParsedAddress(address);

    console.log(parsedAddress);

    let addressEmbedding, streetEmbedding;
    
    addressEmbedding = await createEmbedding(parsedAddress.data);
    console.log("address for embedding: ", parsedAddress.data);

    if (street) {
        streetEmbedding = await createEmbedding(street);
        console.log("street for embedding: ", street);
    }

    const parsedStreet = parsedAddress.parsed
        .filter(entry => ['unit', 'house', 'house_number', 'road'].includes(entry.label))
        .map(entry => entry.value)
        .join(', ');
        
    console.log("parsed street: ", parsedStreet);

    // Determine series requirement based on type
    let requiredSeries = null;
    if (type === 'sold_to') {
        requiredSeries = '1';
    } else if (type === 'ship_to' || type === 'consignee') {
        requiredSeries = '2';
    }
    // if (seriesFallback) requiredSeries = seriesFallback; // Override with fallback if specified
    if (seriesFallback !== null && seriesFallback !== undefined) {
        requiredSeries = seriesFallback;
    }

    // Search based on available embeddings
    let addressSearchResults = [];

    console.log("seriesFallback: ", seriesFallback);

    if (addressEmbedding) {
        // addressSearchResults = await searchAddress(initialize, parsedAddress, street, city, postalCode, country, addressEmbedding, 'addresses', series);
        addressSearchResults = await searchAddress(initialize, type, name, translatedName, parsedAddress, street, parsedStreet, city, postalCode, country, addressEmbedding, streetEmbedding, vectorNamespace, requiredSeries);
        // deduplicate results
        // addressSearchResults = addressSearchResults.filter((v,i,a)=>a.findIndex(t=>(t.metadata.customer === v.metadata.customer))===i);
        console.log("address results: ", JSON.stringify(addressSearchResults))
    }
    
    if (!addressSearchResults || addressSearchResults.length === 0) return [];

    // Filter out 'bio-rad' results
    let filteredResults = addressSearchResults.filter(
        (result) =>
            result?.metadata?.name1?.trim() &&
            !result.metadata.name1.toLowerCase().includes("bio-rad")
    );

    // Not sorting by score for now; using similarity which includes name for now
    // Only sort by score if similarity is not present
    if (!filteredResults?.[0]?.similarity) {
        // Sort filtered results by score in descending order
        filteredResults.sort((a, b) => b.score - a.score);
    }

    console.log("Filtered Results (no bio-rad):", filteredResults);

    /* Similarity Check */
        // Threshold for similarity
        const threshold = 0.8;

        // Compare query name with each metadata.name1
        
        // const resultsWithSimilarity = filteredResults.map(result => {
        //     const similarity = natural.JaroWinklerDistance(
        //         translatedName.toLowerCase(),
        //         result.metadata.name1.toLowerCase()
        //     );
        //     return { ...result, similarity };
        // });

        const resultsWithSimilarity = filteredResults.map(result => {
            const nameSimilarity = name ? natural.JaroWinklerDistance(
                name.toLowerCase(),
                result.metadata.name1.toLowerCase()
            ) : 0;

            const translatedNameSimilarity = translatedName ? natural.JaroWinklerDistance(
                translatedName.toLowerCase(),
                result.metadata.name1.toLowerCase()
            ) : 0;

            const maxSimilarity = Math.max(nameSimilarity, translatedNameSimilarity);
            // return { ...result, similarity: maxSimilarity };
            return { ...result, similarity: parseFloat(maxSimilarity.toFixed(3)) * 1000 };
        });

        // Check if any result meets the threshold
        const matchesAboveThreshold = resultsWithSimilarity.filter(result => result.similarity >= threshold);

        if (matchesAboveThreshold.length > 0) {
            // Update filteredResults only if there are matches above the threshold
            filteredResults = matchesAboveThreshold.sort((a, b) => b.similarity - a.similarity);
        }

        console.log(`Closest matches to ${translatedName}:`, filteredResults);

        // Add unique names to nameArray
        filteredResults.forEach((match) => {
            if (
                match?.metadata?.name1?.trim() &&
                !nameArray.includes(match.metadata.name1)
            ) {
                nameArray.push(match.metadata.name1);
            }
        });

        console.log("Updated nameArray: ", nameArray);

        console.log(filteredResults);
    /* Similarity Check */

    // Return all filtered and ordered results
    return filteredResults.map((result) => ({
        name: result.metadata.name1,
        customer: result.metadata.customer,
        address: result.metadata.oneLineAddress,
        house: result.metadata.houseNumber,
        similarity: (result.similarity) || 0,
    }));
}