import { Router, Request, Response } from "express";
import multer, { FileFilterCallback } from "multer";
import { createClient } from "@supabase/supabase-js";

const router = Router();

// Multer setup
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (
    req: Request,
    file: Express.Multer.File,
    cb: FileFilterCallback
  ) => {
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
      cb(null, true);
    } else {
      cb(new Error("Invalid file type"));
    }
  }
});

// ✅ Create Supabase client once
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

// Middleware to wrap Multer errors
const uploadMiddleware = (req: Request, res: Response, next: Function) => {
  upload.single("file")(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ success: false, error: "Multer error", details: err.message });
    } else if (err) {
      return res.status(400).json({ success: false, error: "Upload error", details: err.message });
    }
    next();
  });
};

// Upload route
router.post("/upload", uploadMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("📥 Upload request received");

    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, error: "No file uploaded", details: null });
      return;
    }

    console.log(`📄 Processing: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);

    const timestamp = Date.now();
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    const uniquePath = `documents/${timestamp}-${sanitized}`;

    console.log(`☁️ Uploading to Supabase Storage: ${uniquePath}`);

    const { error } = await supabase.storage
      .from("documents")
      .upload(uniquePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (error) {
      console.error("❌ Supabase upload error:", { error, file: file.originalname, path: uniquePath });
      res.status(500).json({ success: false, error: "Failed to upload file to storage", details: error.message });
      return;
    }

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
    res.status(500).json({ success: false, error: "Unexpected error", details: message });
  }
});

export default router;
