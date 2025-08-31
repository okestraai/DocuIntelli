import { Router, Request, Response } from "express";
import { getPresignedUploadUrl, generateFileKey } from "../services/storage";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

/**
 * GET /api/signed-url
 * Returns a presigned URL for uploading a file to IBM COS.
 * Authorization: Bearer <APP_UPLOAD_KEY>
 * Query params: filename, contentType
 */
router.get("/signed-url", async (req: Request, res: Response) => {
  try {
    // 1. Check Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ success: false, error: "Missing Authorization header" });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    if (token !== process.env.APP_UPLOAD_KEY) {
      console.warn("❌ Invalid APP_UPLOAD_KEY provided");
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    // 2. Validate query params
    const { filename, contentType } = req.query;
    if (!filename || !contentType) {
      return res.status(400).json({
        success: false,
        error: "filename and contentType query parameters are required",
      });
    }

    // 3. Generate unique file key (namespaced under 'documents/')
    const fileKey = generateFileKey("appuser", filename as string);

    // 4. Generate presigned URL from IBM COS
    const presigned = await getPresignedUploadUrl(fileKey, contentType as string, 3600);

    if (!presigned.success) {
      console.error("❌ Failed to generate presigned URL:", presigned.error);
      return res.status(500).json({
        success: false,
        error: "Failed to generate presigned URL",
        details: presigned.error,
      });
    }

    console.log(`✅ Presigned URL issued for file: ${fileKey}`);

    // 5. Return presigned URL details
    res.json({
      success: true,
      data: {
        upload_url: presigned.uploadUrl,
        file_key: fileKey,
        expires_in: 3600,
      },
    });
  } catch (err: any) {
    console.error("❌ Signed URL error:", err.message);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      details: err.message,
    });
  }
});

export default router;
