import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
dotenv.config();

const cos = new S3Client({
  region: process.env.IBM_COS_REGION,
  endpoint: process.env.IBM_COS_ENDPOINT,
  credentials: {
    accessKeyId: process.env.IBM_COS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.IBM_COS_SECRET_ACCESS_KEY!,
  },
});

(async () => {
  try {
    const res = await cos.send(new ListBucketsCommand({}));
    console.log("✅ Buckets:", res.Buckets);
  } catch (err) {
    console.error("❌ COS connection failed:", err);
  }
})();
