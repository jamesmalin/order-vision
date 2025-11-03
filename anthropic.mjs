import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import fs from "fs/promises";
import { TextDecoder } from "util";
import { z } from "zod";
import dotenv from "dotenv";
dotenv.config();

// const addressSchema = z.object({
//     name: z.string().describe("Recipient's name."),
//     address: z.string().describe("Full address."),
//     address_english: z.string().describe("English version of the address."),
//     address_reason: z.string().describe("Reason for using this address."),
//     address_street: z.string().describe("Street name."),
//     address_city: z.string().describe("City."),
//     address_postal_code: z.string().describe("Postal code."),
//     address_country_code: z.string().describe("Country code."),
// });

// const addressResponseSchema = z.object({
//     sold_to: addressSchema,
//     ship_to: addressSchema,
//     consignee: addressSchema,
// });

const modelMap = new Map([
    ["claude-3.7", "us.anthropic.claude-3-7-sonnet-20250219-v1:0"],
    ["claude-3.5-v2", "anthropic.claude-3-5-sonnet-20241022-v2:0"],
    ["claude-3.5", "anthropic.claude-3-5-sonnet-20240620-v1:0"],
    ["claude-3-haiku", "anthropic.claude-3-haiku-20240307"],
    ["claude-v2", "anthropic.claude-v2"],
]);

export function getModel(modelName) {
    if (!modelMap.has(modelName)) {
        throw new Error(`Model "${modelName}" not found.`);
    }
    return modelMap.get(modelName);
}

function convertZodToJsonSchema(zodSchema) {
    if (zodSchema instanceof z.ZodObject) {
        return {
            type: "object",
            properties: Object.fromEntries(
                Object.entries(zodSchema.shape).map(([key, schema]) => [
                    key,
                    convertZodToJsonSchema(schema),
                ])
            ),
            required: Object.keys(zodSchema.shape),
        };
    } else if (zodSchema instanceof z.ZodString) {
        return { type: "string", description: zodSchema._def.description || "" };
    }
    return {}; // Default case if another type is encountered
}

const client = new BedrockRuntimeClient({
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
    region: "us-west-2"
});

async function anthropic(model, schema, prompt) {
    const tools = [
        {
            name: "extract_invoice_info",
            description: "Extracts key information from the invoice.",
            input_schema: convertZodToJsonSchema(schema),
        },
    ];

    const body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 2000,
        "top_k": 250,
        "stop_sequences": [],
        "temperature": 1,
        "top_p": 0.999,
        "tools": tools,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt
                    }
                ]
            }
        ]
    }

    const input = {
        body: JSON.stringify(body),
        contentType: "application/json",
        accept: "application/json",
        modelId: getModel(model),
    };

    const command = new InvokeModelCommand(input);
    const response = await client.send(command);
    const responseBody = new TextDecoder().decode(response.body);
    return responseBody;
}

function parseAnthropicResponse(response) {
    const parsedResponse = JSON.parse(response).content;
    const toolUse = Array.isArray(parsedResponse) ? parsedResponse.find(entry => entry.type === 'tool_use') : null;
    if (toolUse && toolUse.input) {
        return toolUse.input;
    } else {
        console.log("No tool use data found in the response.");
        return null;
    }
}

export async function callAnthropic(model, schema, prompt) {
    const modelResponse = await anthropic(model, schema, prompt);
    const invoiceEntities = parseAnthropicResponse(modelResponse);
    return invoiceEntities;
}
