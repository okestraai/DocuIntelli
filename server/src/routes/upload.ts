// src/routes/upload.ts

import { Router, Request, Response } from "express";
import multer, { FileFilterCallback } from "multer";
import { createClient } from "@supabase/supabase-js";

const router = Router();

// Multer: in-memory storage with type-safe fileFilter
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "image/jpeg",
      "image/png",
      "image/gif"
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true); // ✅ allow file
    } else {
      cb(new Error("Invalid file type")); // ✅ reject file
    }
  }
});

// Upload endpoint
router.post(
  "/upload",
  (req: Request, res: Response, next) => {
    // Wrap the Multer middleware call in a try/catch to handle upload errors
    try {
      upload.single("file")(req, res, (err) => {
        if (err instanceof multer.MulterError) {
          // A Multer-specific error occurred when uploading.
          return res.status(400).json({ success: false, error: err.message });
        } else if (err) {
          // An unknown error occurred, likely from the fileFilter callback.
          return res.status(400).json({ success: false, error: err.message });
        }
        // If no errors, pass control to the next middleware (the route handler)
        // ✅ The 'return' here satisfies the TypeScript compiler's check.
        return next();
      });
    } catch (err) {
      // This catch block is a fail-safe for any unexpected sync errors
      const message = err instanceof Error ? err.message : "An unexpected Multer error occurred.";
      res.status(500).json({ success: false, error: message });
    }
  },
  async (req: Request, res: Response): Promise<void> => {
    let supabase;
    try {
      // ✅ Supabase client initialization is now safe as it's within the request lifecycle
      supabase = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!
      );

      console.log("📥 Upload request received");

      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, error: "No file uploaded" });
        return;
      }

      console.log(
        `📄 Processing: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`
      );

      // Create unique storage path
      const timestamp = Date.now();
      const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
      const uniquePath = `documents/${timestamp}-${sanitized}`;

      console.log(`☁️ Uploading to Supabase Storage: ${uniquePath}`);

      // Upload to Supabase Storage
      const { error } = await supabase.storage
        .from("documents")
        .upload(uniquePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });

      if (error) {
        console.error("❌ Supabase upload error:", error);
        res.status(500).json({
          success: false,
          error: "Failed to upload file to storage",
          details: error.message
        });
        return;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("documents")
        .getPublicUrl(uniquePath);

      // ✅ Crucial change: Check if urlData exists before trying to access publicUrl
      if (!urlData) {
        console.error("❌ Supabase getPublicUrl error: 'data' object is null.");
        res.status(500).json({
          success: false,
          error: "Failed to retrieve public URL for the uploaded file."
        });
        return;
      }

      console.log(`✅ Uploaded: ${urlData.publicUrl}`);

      res.json({
        success: true,
        path: uniquePath,
        url: urlData.publicUrl,
        filename: file.originalname,
        size: file.size,
        mimetype: file.mimetype
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error occurred";
      console.error("❌ Upload error:", message);
      res.status(500).json({ success: false, error: message });
    }
  }
);

export default router;