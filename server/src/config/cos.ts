import dotenv from "dotenv";
import path from "path";
import { S3Client } from "@aws-sdk/client-s3";

// Load root .env first (commonly used in Bolt), then fall back to server-local .env
const rootEnvPath = path.resolve(process.cwd(), ".env");
dotenv.config({ path: rootEnvPath });
dotenv.config({ path: path.resolve(__dirname, "../../.env"), override: false });

function normalizeEndpoint(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function assertEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    const hint = key.startsWith("IBM_COS")
      ? "Ensure COS credentials and endpoint are set in .env or deployment secrets."
      : "";
    throw new Error(`Missing required environment variable: ${key}${hint ? ` (${hint})` : ""}`);
  }
  return val;
}

const requiredEnvVars = [
  "IBM_COS_ACCESS_KEY_ID",
  "IBM_COS_SECRET_ACCESS_KEY",
  "IBM_COS_BUCKET",
  "IBM_COS_REGION",
  "IBM_COS_ENDPOINT",
];

requiredEnvVars.forEach(assertEnv);

const endpoint = normalizeEndpoint(process.env.IBM_COS_ENDPOINT!);

export const cosConfig = {
  endpoint,
  publicEndpoint: process.env.IBM_COS_PUBLIC_ENDPOINT
    ? normalizeEndpoint(process.env.IBM_COS_PUBLIC_ENDPOINT)
    : endpoint,
  region: process.env.IBM_COS_REGION!,
  bucket: process.env.IBM_COS_BUCKET!,
  accessKeyId: process.env.IBM_COS_ACCESS_KEY_ID!,
  secretAccessKey: process.env.IBM_COS_SECRET_ACCESS_KEY!,
};

export const cosClient = new S3Client({
  region: cosConfig.region,
  endpoint: cosConfig.endpoint,
  forcePathStyle: true, // ✅ IBM COS requires path-style URLs
  credentials: {
    accessKeyId: cosConfig.accessKeyId,
    secretAccessKey: cosConfig.secretAccessKey,
  },
});
