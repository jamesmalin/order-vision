import { VertexAI } from '@google-cloud/vertexai';
import path from 'path';
import { z } from 'zod';

process.env.GOOGLE_APPLICATION_CREDENTIALS = path.resolve(new URL('.', import.meta.url).pathname, 'gcp-key.json');

const vertexAI = new VertexAI({
  project: 'gcp-git-biorad-ai-prj-p101',
  location: 'us-central1',
});

// export function convertZodToJsonSchema(zodSchema) {
//   if (zodSchema instanceof z.ZodObject) {
//     return {
//       type: "object",
//       properties: Object.fromEntries(
//         Object.entries(zodSchema.shape).map(([key, schema]) => [
//           key,
//           convertZodToJsonSchema(schema),
//         ])
//       ),
//       required: Object.keys(zodSchema.shape),
//     };
//   } else if (zodSchema instanceof z.ZodString) {
//     return { type: "string", description: zodSchema._def.description || "" };
//   } else if (zodSchema instanceof z.ZodArray) {
//     return {
//       type: "array",
//       items: convertZodToJsonSchema(zodSchema._def.type),
//     };
//   }
//   return {}; // Default case if another type is encountered
// }

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

export async function generateContent(model, prompt, schema) {
  const vertexModel = vertexAI.getGenerativeModel({
    model: model,
    generationConfig: {
      temperature: 0,
      // maxOutputTokens: 1024,
      responseMimeType: 'application/json',
      responseSchema: convertZodToJsonSchema(schema),
    },
  });

  const request = {
    contents: [
      { role: 'user', parts: [{ text: prompt }] },
    ],
  };

  const response = await vertexModel.generateContent(request);
  const jsonResponse = response.response.candidates[0].content.parts[0].text;
  // return jsonResponse;
  try {
    const structuredData = JSON.parse(jsonResponse);
    // console.log(structuredData);
    return structuredData;
  } catch (error) {
    console.error('Failed to parse JSON:', error);
    console.log('Raw response:', jsonResponse);
  }
}
