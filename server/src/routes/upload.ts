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
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    try {
      // ✅ Move the Supabase client initialization inside the handler
      // This ensures environment variables are loaded before the client is created.
      const supabase = createClient(
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