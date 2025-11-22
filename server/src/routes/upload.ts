import { Router, Request, Response } from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import {
  uploadToSupabase,
  getSignedDownloadUrl,
  deleteFromSupabase,
  generateFileKey,
  fileExistsInSupabase,
} from "../services/supabaseStorage";
import dotenv from "dotenv";

dotenv.config();

const router = Router();

// Supabase client for database operations
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabase = createClient(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Multer setup
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "text/plain",
      "image/jpeg",
      "image/png",
      "image/gif",
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported type: ${file.mimetype}`));
  },
});

/**
 * POST /api/upload
 * Upload document to Supabase Storage and create DB record
 */
router.post("/upload", upload.single("file"), async (req: Request, res: Response): Promise<void> => {
  try {
    console.log("📥 Upload request received");

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ success: false, error: "Authorization header required" });
      return;
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      res.status(401).json({ success: false, error: "Invalid or expired token" });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, error: "No file uploaded" });
      return;
    }

    const { name, category, expirationDate } = req.body;
    if (!name || !category) {
      res.status(400).json({ success: false, error: "Name and category required" });
      return;
    }

    const fileKey = generateFileKey(user.id, file.originalname);

    if (await fileExistsInSupabase(fileKey)) {
      res.status(409).json({ success: false, error: "File already exists" });
      return;
    }

    const uploadResult = await uploadToSupabase(file.buffer, fileKey, file.mimetype);
    if (!uploadResult.success) {
      res.status(500).json({ success: false, error: uploadResult.error });
      return;
    }

    const { data: documentData, error: dbError } = await supabase
      .from("documents")
      .insert([{
        user_id: user.id,
        name: name.trim(),
        category,
        type: file.mimetype,
        size: file.size,
        file_path: fileKey,
        original_name: file.originalname,
        upload_date: new Date().toISOString().split("T")[0],
        expiration_date: expirationDate || null,
        status: "active",
        processed: false,
      }])
      .select()
      .single();

    if (dbError) {
      await deleteFromSupabase(fileKey);
      res.status(500).json({ success: false, error: "DB insert failed", details: dbError.message });
      return;
    }

    res.json({
      success: true,
      data: {
        document_id: documentData.id,
        file_key: fileKey,
        public_url: uploadResult.url,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("❌ Upload error:", message);
    res.status(500).json({ success: false, error: "Internal server error", details: message });
  }
});

/**
 * GET /api/documents/:id/download
 * Generate signed download URL
 */
router.get("/documents/:id/download", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ success: false, error: "Authorization required" });
      return;
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      res.status(401).json({ success: false, error: "Invalid or expired token" });
      return;
    }

    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("file_path, name")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (docError || !document) {
      res.status(404).json({ success: false, error: "Document not found" });
      return;
    }

    const downloadUrl = await getSignedDownloadUrl(document.file_path, 3600);
    res.json({ success: true, download_url: downloadUrl, filename: document.name });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("❌ Download error:", message);
    res.status(500).json({ success: false, error: "Internal server error", details: message });
  }
});

/**
 * DELETE /api/documents/:id
 * Delete document from Supabase Storage and database
 */
router.delete("/documents/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ success: false, error: "Authorization required" });
      return;
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (userError || !user) {
      res.status(401).json({ success: false, error: "Invalid or expired token" });
      return;
    }

    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("file_path")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (docError || !document) {
      res.status(404).json({ success: false, error: "Document not found" });
      return;
    }

    await deleteFromSupabase(document.file_path);

    await supabase.from("document_chunks").delete().eq("document_id", id).eq("user_id", user.id);
    await supabase.from("documents").delete().eq("id", id).eq("user_id", user.id);

    res.json({ success: true, message: "Document deleted" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("❌ Delete error:", message);
    res.status(500).json({ success: false, error: "Internal server error", details: message });
  }
});

export default router;
