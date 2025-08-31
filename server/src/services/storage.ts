import { PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { cosClient, cosConfig } from '../config/cos';

export interface UploadResult {
  success: boolean;
  key?: string;
  url?: string;
  error?: string;
}

export interface PresignedUrlResult {
  success: boolean;
  uploadUrl?: string;
  key?: string;
  error?: string;
}

/**
 * Upload a file buffer to IBM Cloud Object Storage
 */
export async function uploadToCOS(
  file: Buffer, 
  key: string, 
  contentType?: string
): Promise<UploadResult> {
  try {
    console.log(`📤 Uploading to IBM COS: ${key}`);
    console.log(`📊 File size: ${file.length} bytes`);
    console.log(`📋 Content type: ${contentType || 'application/octet-stream'}`);

    const command = new PutObjectCommand({
      Bucket: cosConfig.bucket,
      Key: key,
      Body: file,
      ContentType: contentType || 'application/octet-stream',
      // Add metadata for tracking
      Metadata: {
        'upload-timestamp': new Date().toISOString(),
        'upload-source': 'legalease-app'
      }
    });

    const result = await cosClient.send(command);
    
    // Construct public URL
    const publicUrl = `${cosConfig.endpoint}/${cosConfig.bucket}/${key}`;
    
    console.log(`✅ Upload successful to IBM COS:`);
    console.log(`   - Key: ${key}`);
    console.log(`   - URL: ${publicUrl}`);
    console.log(`   - ETag: ${result.ETag}`);

    return {
      success: true,
      key: key,
      url: publicUrl
    };
  } catch (error) {
    console.error('❌ IBM COS upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed'
    };
  }
}

/**
 * Generate a presigned URL for direct client uploads
 */
export async function getPresignedUploadUrl(
  key: string, 
  contentType: string,
  expiresIn: number = 3600
): Promise<PresignedUrlResult> {
  try {
    console.log(`🔗 Generating presigned URL for: ${key}`);
    console.log(`⏰ Expires in: ${expiresIn} seconds`);

    const command = new PutObjectCommand({
      Bucket: cosConfig.bucket,
      Key: key,
      ContentType: contentType,
      Metadata: {
        'upload-timestamp': new Date().toISOString(),
        'upload-source': 'legalease-presigned'
      }
    });

    const uploadUrl = await getSignedUrl(cosClient, command, { 
      expiresIn: expiresIn 
    });

    console.log(`✅ Presigned URL generated successfully`);
    console.log(`   - Key: ${key}`);
    console.log(`   - Expires: ${new Date(Date.now() + expiresIn * 1000).toISOString()}`);

    return {
      success: true,
      uploadUrl: uploadUrl,
      key: key
    };
  } catch (error) {
    console.error('❌ Presigned URL generation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate presigned URL'
    };
  }
}

/**
 * Generate a presigned URL for downloading/viewing files
 */
export async function getPresignedDownloadUrl(
  key: string, 
  expiresIn: number = 3600
): Promise<string> {
  try {
    const command = new GetObjectCommand({
      Bucket: cosConfig.bucket,
      Key: key
    });

    const downloadUrl = await getSignedUrl(cosClient, command, { 
      expiresIn: expiresIn 
    });

    console.log(`🔗 Generated download URL for: ${key}`);
    return downloadUrl;
  } catch (error) {
    console.error('❌ Download URL generation error:', error);
    throw new Error(`Failed to generate download URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Delete a file from IBM COS
 */
export async function deleteFromCOS(key: string): Promise<boolean> {
  try {
    console.log(`🗑️ Deleting from IBM COS: ${key}`);

    const command = new DeleteObjectCommand({
      Bucket: cosConfig.bucket,
      Key: key
    });

    await cosClient.send(command);
    
    console.log(`✅ File deleted successfully: ${key}`);
    return true;
  } catch (error) {
    console.error('❌ IBM COS delete error:', error);
    return false;
  }
}

/**
 * Check if a file exists in IBM COS
 */
export async function fileExistsInCOS(key: string): Promise<boolean> {
  try {
    const command = new GetObjectCommand({
      Bucket: cosConfig.bucket,
      Key: key
    });

    await cosClient.send(command);
    return true;
  } catch (error) {
    // File doesn't exist or access denied
    return false;
  }
}

/**
 * Generate a unique file key with user isolation
 */
export function generateFileKey(userId: string, originalFilename: string): string {
  const timestamp = Date.now();
  const sanitizedName = originalFilename.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `documents/${userId}/${timestamp}-${sanitizedName}`;
}