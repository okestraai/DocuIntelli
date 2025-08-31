import dotenv from "dotenv";
import path from "path";
import { S3Client } from "@aws-sdk/client-s3";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

const requiredEnvVars = [
  "IBM_COS_ACCESS_KEY_ID",
  "IBM_COS_SECRET_ACCESS_KEY",
  "IBM_COS_BUCKET",
  "IBM_COS_REGION",
  "IBM_COS_ENDPOINT",
];

requiredEnvVars.forEach(requireEnv);

export const cosConfig = {
  endpoint: process.env.IBM_COS_ENDPOINT!,
  region: process.env.IBM_COS_REGION!,
  bucket: process.env.IBM_COS_BUCKET!,
  accessKeyId: process.env.IBM_COS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.IBM_COS_SECRET_ACCESS_KEY!,
};

export const cosClient = new S3Client({
  region: cosConfig.region,
  endpoint: cosConfig.endpoint,
  credentials: {
    accessKeyId: cosConfig.accessKeyId,
    secretAccessKey: cosConfig.secretAccessKey,
  },
});
