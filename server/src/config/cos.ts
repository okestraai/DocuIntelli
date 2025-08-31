import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from both server/.env and root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from both server/.env and root .env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { S3Client } from '@aws-sdk/client-s3';

/**
 * Helper function to safely get required environment variables
 */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// Required environment variables for IBM COS
const requiredEnvVars: string[] = [
  'IBM_COS_ACCESS_KEY_ID',
  'IBM_COS_SECRET_ACCESS_KEY',
  'IBM_COS_BUCKET',
  'IBM_COS_ENDPOINT',
  'IBM_COS_REGION'
];

// Validate all required environment variables
for (const envVar of requiredEnvVars) {
  requireEnv(envVar);
}

/**
 * Helper function to safely get required environment variables
 */
function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

// Required environment variables for IBM COS
const requiredEnvVars: string[] = [
  'IBM_COS_ACCESS_KEY_ID',
  'IBM_COS_SECRET_ACCESS_KEY',
  'IBM_COS_BUCKET',
  'IBM_COS_ENDPOINT',
  'IBM_COS_REGION'
];

// Validate all required environment variables
for (const envVar of requiredEnvVars) {
  requireEnv(envVar);
}

// IBM Cloud Object Storage configuration
export const cosConfig = {
  accessKeyId: requireEnv('IBM_COS_ACCESS_KEY_ID'),
  secretAccessKey: requireEnv('IBM_COS_SECRET_ACCESS_KEY'),
  bucket: requireEnv('IBM_COS_BUCKET'),
  endpoint: requireEnv('IBM_COS_ENDPOINT'),
  region: requireEnv('IBM_COS_REGION')
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

console.log('🔧 IBM COS Client initialized:', {
  bucket: cosConfig.bucket,
  endpoint: cosConfig.endpoint,
  region: cosConfig.region
});