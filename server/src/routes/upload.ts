import { Router, Request, Response } from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

const router = Router();

// Multer: in-memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (
    req,
    file,
    cb: (error: Error | null, acceptFile: boolean) => void
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
      cb(null, true); // ✅ valid type
    } else {
      cb(new Error("Invalid file type"), false); // ✅ valid type
    }
  }
});


// Supabase client — use backend-safe env vars
const supabase = createClient(
  process.env.SUPABASE_URL!,        // ✅ backend should use SUPABASE_URL
  process.env.SUPABASE_ANON_KEY!    // ✅ backend should use SUPABASE_ANON_KEY
);

router.post("/upload", upload.single("file"), async (req: Request, res: Response) => {
  try {
    console.log("📥 Upload request received");

    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    console.log(`📄 Processing: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`);

    // Create unique path
    const timestamp = Date.now();
    const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, "_");
    const uniquePath = `documents/${timestamp}-${sanitized}`;

    console.log(`☁️ Uploading to Supabase Storage: ${uniquePath}`);

    // Upload
    const { error } = await supabase.storage
      .from("documents")
      .upload(uniquePath, file.buffer, {
        contentType: file.mimetype,
        upsert: false
      });

    if (error) {
      console.error("❌ Supabase upload error:", error);
      return res.status(500).json({
        success: false,
        error: "Failed to upload file to storage",
        details: error.message
      });
    }

    // Public URL
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
});

export default router;
