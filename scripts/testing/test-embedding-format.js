// Test embedding format
import dotenv from 'dotenv';
dotenv.config();

const vllmEmbedderUrl = process.env.VLLM_EMBEDDER_URL;
const cfAccessClientId = process.env.CF_ACCESS_CLIENT_ID;
const cfAccessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET;

// Test with a simple text
const testText = 'Instruct: Represent this document for retrieval\nQuery: Hello world';

const response = await fetch(`${vllmEmbedderUrl}/v1/embeddings`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'CF-Access-Client-Id': cfAccessClientId,
    'CF-Access-Client-Secret': cfAccessClientSecret,
  },
  body: JSON.stringify({
    model: 'intfloat/e5-mistral-7b-instruct',
    input: [testText],
  }),
});

const data = await response.json();
const embedding = data.data[0].embedding;

console.log('Embedding type:', typeof embedding);
console.log('Is array:', Array.isArray(embedding));
console.log('Length:', embedding.length);
console.log('First 5 values:', embedding.slice(0, 5));
console.log('');
console.log('When JSON.stringify:', JSON.stringify(embedding).substring(0, 100));
