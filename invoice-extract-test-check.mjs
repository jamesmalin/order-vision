import { customerTest } from './invoice-extract-test.mjs';

// const model = 'sf-ai';
// const apiVersion = '2023-07-01-preview';
const model = 'gpt-4o';
const apiVersion = '2024-08-01-preview';
const filePath = './qa_testing/VT020.pdf';
await customerTest(filePath, model, apiVersion);