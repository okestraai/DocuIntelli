import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase configuration');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface UploadResult {
  success: boolean;
  key?: string;
  url?: string;
  error?: string;
}

/**
 * Upload a file buffer to Supabase Storage
 */
export async function uploadToSupabase(
  file: Buffer,
  key: string,
  contentType?: string
): Promise<UploadResult> {
  try {
    console.log(`📤 Uploading to Supabase Storage: ${key}`);
    console.log(`📊 File size: ${file.length} bytes`);
    console.log(`📋 Content type: ${contentType || 'application/octet-stream'}`);

    const { data, error } = await supabase.storage
      .from('documents')
      .upload(key, file, {
        contentType: contentType || 'application/octet-stream',
        upsert: false,
      });

    if (error) {
      console.error('❌ Supabase Storage upload error:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(key);

    console.log(`✅ Upload successful to Supabase Storage:`);
    console.log(`   - Key: ${key}`);
    console.log(`   - Path: ${data.path}`);

    return {
      success: true,
      key: data.path,
      url: urlData.publicUrl,
    };
  } catch (error: any) {
    console.error('❌ Supabase Storage upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

/**
 * Generate a signed URL for downloading/viewing files
 */
export async function getSignedDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  try {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(key, expiresIn);

    if (error) {
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }

    return data.signedUrl;
  } catch (error: any) {
    console.error('❌ Signed URL generation error:', error.message);
    throw error;
  }
}

/**
 * Delete a file from Supabase Storage
 */
export async function deleteFromSupabase(key: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from('documents')
      .remove([key]);

    if (error) {
      console.error('❌ Supabase Storage delete error:', error.message);
      return false;
    }

    console.log(`✅ File deleted successfully: ${key}`);
    return true;
  } catch (error: any) {
    console.error('❌ Supabase Storage delete error:', error.message);
    return false;
  }
}

/**
 * Check if a file exists in Supabase Storage
 */
export async function fileExistsInSupabase(key: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.storage
      .from('documents')
      .list(key.split('/').slice(0, -1).join('/'), {
        search: key.split('/').pop(),
      });

    if (error) {
      return false;
    }

    return data && data.length > 0;
  } catch {
    return false;
  }
}

/**
 * Generate a unique file key with user isolation
 */
export function generateFileKey(
  userId: string,
  originalFilename: string
): string {
  const timestamp = Date.now();
  const sanitizedName = originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${userId}/${timestamp}-${sanitizedName}`;
}
