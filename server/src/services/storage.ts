import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration:', {
    SUPABASE_URL: supabaseUrl ? '✓ Set' : '✗ Missing',
    SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey ? '✓ Set' : '✗ Missing'
  });
  throw new Error('Missing Supabase configuration');
}

console.log('✓ Supabase client initialized for storage operations');
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface UploadResult {
  success: boolean;
  filePath?: string;
  publicUrl?: string;
  error?: string;
}

export async function uploadToStorage(
  file: Buffer,
  userId: string,
  originalFilename: string,
  mimeType: string
): Promise<UploadResult> {
  try {
    const timestamp = Date.now();
    const sanitizedName = originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `${userId}/${timestamp}-${sanitizedName}`;

    console.log(`📤 Uploading to Supabase Storage: ${filePath}`);

    const { data, error } = await supabase.storage
      .from('documents')
      .upload(filePath, file, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) {
      console.error('❌ Storage upload error:', error);
      return {
        success: false,
        error: error.message,
      };
    }

    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);

    console.log(`✅ File uploaded successfully: ${filePath}`);

    return {
      success: true,
      filePath: data.path,
      publicUrl: urlData.publicUrl,
    };
  } catch (error: any) {
    console.error('❌ Upload error:', error);
    return {
      success: false,
      error: error.message || 'Upload failed',
    };
  }
}

export async function deleteFromStorage(filePath: string): Promise<boolean> {
  try {
    const { error } = await supabase.storage
      .from('documents')
      .remove([filePath]);

    if (error) {
      console.error('❌ Storage delete error:', error);
      return false;
    }

    console.log(`✅ File deleted: ${filePath}`);
    return true;
  } catch (error: any) {
    console.error('❌ Delete error:', error);
    return false;
  }
}

export async function getSignedUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
  try {
    const { data, error } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, expiresIn);

    if (error) {
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }

    return data.signedUrl;
  } catch (error: any) {
    console.error('❌ Signed URL error:', error);
    throw error;
  }
}
