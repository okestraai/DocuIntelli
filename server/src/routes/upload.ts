import { Router, Request, Response } from "express";
import { createClient } from "@supabase/supabase-js";
import { getPresignedUploadUrl, generateFileKey } from "../services/storage";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

// Supabase client for JWT validation (use ANON_KEY here, not service role)
// const supabase = createClient(
 // process.env.SUPABASE_URL!,
  // process.env.SUPABASE_ANON_KEY!
);

const supabaseAuth = createClient(
  process.env.SUPABASE_URL || "https://caygpjhiakabaxtklnlw.supabase.co",
  process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNheWdwamhpYWthYmF4dGtsbmx3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYwNzMzMTQsImV4cCI6MjA3MTY0OTMxNH0.UYaF1hW_j2HGcFP5W1FMV_G7ODGJuz8qieyf9Qe4Z90"
);

/**
 * GET /api/signed-url - Generate presigned URL for uploads
 * Requires: Authorization: Bearer <supabase_jwt>
 * Query params: filename, contentType
 */
router.get("/signed-url", async (req: Request, res: Response) => {
  try {
    // 1. Validate Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      console.warn("❌ Missing Authorization header");
      return res.status(401).json({
        success: false,
        error: "Authorization header required",
      });
    }

    const token = authHeader.replace("Bearer ", "").trim();

    // 2. Validate JWT with Supabase
 const { data: { user }, error: userError } = await // Simple API key validation
const authHeader = req.headers.authorization;
if (!authHeader || authHeader !== `Bearer ${process.env.APP_UPLOAD_KEY}`) {
  console.warn("❌ Unauthorized request to /signed-url");
  return res.status(401).json({ success: false, error: "Unauthorized" });
}

    // 3. Validate query params
    const { filename, contentType } = req.query;
    if (!filename || !contentType) {
      return res.status(400).json({
        success: false,
        error: "filename and contentType query parameters are required",
      });
    }

    // 4. Generate file key
    const fileKey = generateFileKey(user.id, filename as string);

    // 5. Get presigned URL from IBM COS
    const presigned = await getPresignedUploadUrl(
      fileKey,
      contentType as string,
      3600
    );

    if (!presigned.success) {
      console.error("❌ COS presigned URL error:", presigned.error);
      return res.status(500).json({
        success: false,
        error: "Failed to generate presigned URL",
        details: presigned.error,
      });
    }

    console.log(`✅ Presigned URL generated for user=${user.id}, file=${fileKey}`);

    // 6. Return to frontend
    res.json({
      success: true,
      data: {
        upload_url: presigned.uploadUrl,
        file_key: fileKey,
        expires_in: 3600,
      },
    });
  } catch (err: any) {
    console.error("❌ Signed URL route error:", err.message);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: err.message,
    });
  }
});

export default router;
