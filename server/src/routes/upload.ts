import { Router, Request, Response } from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import {
  uploadToCOS,
  getPresignedUploadUrl,
  getPresignedDownloadUrl,
  deleteFromCOS,
  generateFileKey,
  fileExistsInCOS,
  UploadResult,
  PresignedUrlResult,
} from '../services/storage';

// Type definitions for API responses
interface ProcessingResult {
  success: boolean;
  chunks_processed?: number;
  document_id?: string;
  message?: string;
  error?: string;
}

interface DocumentData {
  id: string;
  user_id: string;
  name: string;
  category: string;
  type: string;
  size: string;
  file_path: string;
  original_name: string;
  upload_date: string;
  expiration_date: string | null;
  status: string;
  processed: boolean;
  created_at: string;
  updated_at: string;
}

interface UploadApiResponse {
  success: boolean;
  data?: {
    document_id: string;
    file_key: string;
    public_url: string;
    file_type: string;
    size: string;
  };
  error?: string;
  details?: string;
}

interface PresignedUrlApiResponse {
  success: boolean;
  data?: {
    upload_url: string;
    file_key: string;
    expires_in: number;
  };
  error?: string;
  details?: string;
}

interface DownloadUrlApiResponse {
  success: boolean;
  download_url?: string;
  filename?: string;
  error?: string;
  details?: string;
}

interface DeleteApiResponse {
  success: boolean;
  message?: string;
  error?: string;
  details?: string;
}

const router = Router();

// Initialize Supabase client for database operations
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Validate Supabase configuration
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing required Supabase environment variables');
}

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/gif',
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

/**
 * POST /api/upload - Upload document to IBM COS and create database record
 */
router.post(
  '/upload',
  upload.single('file'),
  async (req: Request, res: Response): Promise<Response<UploadApiResponse>> => {
    try {
      console.log('📥 Upload request received');

      // Get user from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({
          success: false,
          error: 'Authorization header required',
        });
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

      if (userError || !user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired token',
        });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded',
        });
      }

      const { name, category, expirationDate } = req.body;
      if (!name || !category) {
        return res.status(400).json({
          success: false,
          error: 'Name and category are required',
        });
      }

      console.log(
        `📄 Processing file: ${file.originalname} (${file.mimetype}, ${file.size} bytes)`
      );
      console.log(`👤 User: ${user.id}`);
      console.log(
        `📝 Metadata: name="${name}", category="${category}"`
      );

      // Generate unique file key
      const fileKey = generateFileKey(user.id, file.originalname);
      console.log(`🔑 Generated file key: ${fileKey}`);

      // Check for duplicate uploads (idempotency)
      const existingFile = await fileExistsInCOS(fileKey);
      if (existingFile) {
        console.log(`⚠️ File already exists: ${fileKey}`);
        return res.status(409).json({
          success: false,
          error: 'File already exists',
        });
      }

      // Upload to IBM COS
      const uploadResult: UploadResult = await uploadToCOS(
        file.buffer,
        fileKey,
        file.mimetype
      );

      if (!uploadResult.success) {
        return res.status(500).json({
          success: false,
          error: 'Failed to upload file to storage',
          details: uploadResult.error,
        });
      }

      console.log(`✅ File uploaded to IBM COS: ${uploadResult.url}`);

      // Helpers
      const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return (
          parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
        );
      };

      const getFileType = (mimeType: string): string => {
        if (mimeType.includes('pdf')) return 'PDF';
        if (mimeType.includes('word')) return 'Word';
        if (mimeType.includes('text')) return 'Text';
        if (mimeType.includes('image')) return 'Image';
        return 'Document';
      };

      // Create document record
      const { data: documentData, error: dbError }: { 
        data: DocumentData | null; 
        error: any 
      } = await supabase
        .from('documents')
        .insert([
          {
            user_id: user.id,
            name: name.trim(),
            category: category,
            type: getFileType(file.mimetype),
            size: formatFileSize(file.size),
            file_path: fileKey,
            original_name: file.originalname,
            upload_date: new Date().toISOString().split('T')[0],
            expiration_date: expirationDate || null,
            status: 'active',
            processed: false,
          },
        ])
        .select()
        .single();

      if (dbError) {
        console.error('❌ Database insert error:', dbError);
        await deleteFromCOS(fileKey); // cleanup
        return res.status(500).json({
          success: false,
          error: 'Failed to create document record',
          details: dbError.message,
        });
      }

      console.log(`✅ Document record created: ${documentData.id}`);

      // Trigger document processing (non-blocking)
      try {
        console.log(`🔄 Triggering document processing for: ${documentData.id}`);
        const processResponse = await fetch(
          `${process.env.SUPABASE_URL}/functions/v1/process-document`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              document_id: documentData.id,
              file_key: fileKey,
              file_type: file.mimetype,
            }),
          }
        );

        if (processResponse.ok) {
          const processResult: ProcessingResult = await processResponse.json();
          console.log(
            `✅ Document processing initiated: ${
              processResult.chunks_processed || 0
            } chunks`
          );
        } else {
          console.error(
            '⚠️ Document processing failed:',
            await processResponse.text()
          );
        }
      } catch (processError) {
        console.error(
          '⚠️ Document processing error (non-blocking):',
          processError
        );
      }

      return res.json({
        success: true,
        data: {
          document_id: documentData.id,
          file_key: fileKey,
          public_url: uploadResult.url,
          file_type: getFileType(file.mimetype),
          size: formatFileSize(file.size),
        },
      });
    } catch (error) {
      console.error('❌ Upload error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/upload-metadata - Create document metadata record after successful COS upload
 */
router.post(
  '/upload-metadata',
  async (req: Request, res: Response): Promise<Response<UploadApiResponse>> => {
    try {
      console.log('📝 Metadata creation request received');

      // Get user from Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({
          success: false,
          error: 'Authorization header required',
        });
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

      if (userError || !user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired token',
        });
      }

      const { name, category, expirationDate, file_key, file_type, file_size, original_name } = req.body;
      if (!name || !category || !file_key || !file_type || !file_size || !original_name) {
        return res.status(400).json({
          success: false,
          error: 'Missing required metadata fields',
        });
      }

      console.log(`📝 Creating metadata for: ${name} (${file_key})`);

      // Helpers
      const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return (
          parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
        );
      };

      const getFileType = (mimeType: string): string => {
        if (mimeType.includes('pdf')) return 'PDF';
        if (mimeType.includes('word')) return 'Word';
        if (mimeType.includes('text')) return 'Text';
        if (mimeType.includes('image')) return 'Image';
        return 'Document';
      };

      // Create document record
      const { data: documentData, error: dbError }: { 
        data: DocumentData | null; 
        error: any 
      } = await supabase
        .from('documents')
        .insert([
          {
            user_id: user.id,
            name: name.trim(),
            category: category,
            type: getFileType(file_type),
            size: formatFileSize(file_size),
            file_path: file_key,
            original_name: original_name,
            upload_date: new Date().toISOString().split('T')[0],
            expiration_date: expirationDate || null,
            status: 'active',
            processed: false,
          },
        ])
        .select()
        .single();

      if (dbError) {
        console.error('❌ Database insert error:', dbError);
        return res.status(500).json({
          success: false,
          error: 'Failed to create document record',
          details: dbError.message,
        });
      }

      console.log(`✅ Document record created: ${documentData.id}`);

      // Trigger document processing (non-blocking)
      try {
        console.log(`🔄 Triggering document processing for: ${documentData.id}`);
        const processResponse = await fetch(
          `${process.env.SUPABASE_URL}/functions/v1/process-document`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              document_id: documentData.id,
              file_key: file_key,
              file_type: file_type,
            }),
          }
        );

        if (processResponse.ok) {
          const processResult: ProcessingResult = await processResponse.json();
          console.log(
            `✅ Document processing initiated: ${
              processResult.chunks_processed || 0
            } chunks`
          );
        } else {
          console.error(
            '⚠️ Document processing failed:',
            await processResponse.text()
          );
        }
      } catch (processError) {
        console.error(
          '⚠️ Document processing error (non-blocking):',
          processError
        );
      }

      // Generate public URL for response
      const publicUrl = `${process.env.IBM_COS_ENDPOINT}/${process.env.IBM_COS_BUCKET}/${file_key}`;

      return res.json({
        success: true,
        data: {
          document_id: documentData.id,
          file_key: file_key,
          public_url: publicUrl,
          file_type: getFileType(file_type),
          size: formatFileSize(file_size),
        },
      });
    } catch (error) {
      console.error('❌ Metadata creation error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/signed-url
 */
router.get(
  '/signed-url',
  async (req: Request, res: Response): Promise<Response<PresignedUrlApiResponse>> => {
    try {
      console.log('🔗 Presigned URL request received');

      const authHeader = req.headers.authorization;
      if (!authHeader) {
        console.error('❌ Missing Authorization header in presigned URL request');
        return res.status(401).json({
          success: false,
          error: 'Authorization header required for presigned URL generation',
        });
      }

      console.log('🔐 Validating user token for presigned URL...');
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

      if (userError || !user) {
        console.error('❌ Invalid user token for presigned URL:', userError?.message || 'No user found');
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired token for presigned URL generation',
          details: userError?.message || 'User authentication failed',
        });
      }

      console.log(`✅ User authenticated for presigned URL: ${user.id}`);

      const { filename, contentType } = req.query;
      if (!filename || !contentType) {
        console.error('❌ Missing filename or contentType in presigned URL request');
        return res.status(400).json({
          success: false,
          error: 'filename and contentType required',
        });
      }

      console.log(`📝 Generating presigned URL for: ${filename} (${contentType})`);
      const fileKey = generateFileKey(user.id, filename as string);

      const presignedResult: PresignedUrlResult = await getPresignedUploadUrl(
        fileKey,
        contentType as string,
        3600
      );

      if (!presignedResult.success) {
        console.error('❌ Failed to generate presigned URL:', presignedResult.error);
        return res.status(500).json({
          success: false,
          error: 'Failed to generate presigned URL',
          details: presignedResult.error,
        });
      }

      console.log(`✅ Presigned URL generated successfully for key: ${fileKey}`);
      return res.json({
        success: true,
        data: {
          upload_url: presignedResult.uploadUrl,
          file_key: fileKey,
          expires_in: 3600,
        },
      });
    } catch (error) {
      console.error('❌ Presigned URL error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * GET /api/documents/:id/download
 */
router.get(
  '/documents/:id/download',
  async (req: Request, res: Response): Promise<Response<DownloadUrlApiResponse>> => {
    try {
      const { id } = req.params;

      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({
          success: false,
          error: 'Authorization header required',
        });
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

      if (userError || !user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired token',
        });
      }

      const { data: document, error: docError }: {
        data: { file_path: string; name: string } | null;
        error: any;
      } = await supabase
        .from('documents')
        .select('file_path, name')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (docError || !document) {
        return res.status(404).json({
          success: false,
          error: 'Document not found',
        });
      }

      const downloadUrl = await getPresignedDownloadUrl(
        document.file_path,
        3600
      );

      return res.json({
        success: true,
        download_url: downloadUrl,
        filename: document.name,
      });
    } catch (error) {
      console.error('❌ Download URL error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * DELETE /api/documents/:id
 */
router.delete(
  '/documents/:id',
  async (req: Request, res: Response): Promise<Response<DeleteApiResponse>> => {
    try {
      const { id } = req.params;

      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({
          success: false,
          error: 'Authorization header required',
        });
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

      if (userError || !user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid or expired token',
        });
      }

      const { data: document, error: docError }: {
        data: { file_path: string } | null;
        error: any;
      } = await supabase
        .from('documents')
        .select('file_path')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();

      if (docError || !document) {
        return res.status(404).json({
          success: false,
          error: 'Document not found',
        });
      }

      console.log(`🗑️ Deleting document: ${id}`);

      const cosDeleted = await deleteFromCOS(document.file_path);
      if (!cosDeleted) {
        console.error('⚠️ Failed to delete file from COS');
      }

      await supabase.from('document_chunks').delete().eq('document_id', id);

      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (deleteError) {
        return res.status(500).json({
          success: false,
          error: 'Failed to delete document',
          details: deleteError.message,
        });
      }

      return res.json({
        success: true,
        message: 'Document deleted successfully',
      });
    } catch (error) {
      console.error('❌ Delete error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;