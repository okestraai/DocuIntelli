import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'IBM_COS_ACCESS_KEY_ID',
  'IBM_COS_SECRET_ACCESS_KEY',
  'IBM_COS_BUCKET',
  'IBM_COS_ENDPOINT',
  'IBM_COS_REGION'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// IBM Cloud Object Storage configuration
export const cosConfig = {
  accessKeyId: process.env.IBM_COS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.IBM_COS_SECRET_ACCESS_KEY!,
  bucket: process.env.IBM_COS_BUCKET!,
  endpoint: process.env.IBM_COS_ENDPOINT!,
  region: process.env.IBM_COS_REGION!
};

// Create S3 client configured for IBM COS
export const cosClient = new S3Client({
  region: cosConfig.region,
  endpoint: cosConfig.endpoint,
  credentials: {
    accessKeyId: cosConfig.accessKeyId,
    secretAccessKey: cosConfig.secretAccessKey,
  },
  forcePathStyle: true, // Required for IBM COS
});

console.log('🔧 IBM COS Client initialized:', {
  bucket: cosConfig.bucket,
  endpoint: cosConfig.endpoint,
  region: cosConfig.region
});