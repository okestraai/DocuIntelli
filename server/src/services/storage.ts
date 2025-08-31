import {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
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
      Metadata: {
        'upload-timestamp': new Date().toISOString(),
        'upload-source': 'legalease-app',
      },
    });

    const result = await cosClient.send(command);

    // ✅ Correct public URL style
    const publicUrl = `https://${cosConfig.bucket}.${cosConfig.endpoint.replace(
      /^https?:\/\//,
      ''
    )}/${key}`;

    console.log(`✅ Upload successful to IBM COS:`);
    console.log(`   - Key: ${key}`);
    console.log(`   - URL: ${publicUrl}`);
    console.log(`   - ETag: ${result.ETag}`);

    return {
      success: true,
      key,
      url: publicUrl,
    };
  } catch (error: any) {
    console.error('❌ IBM COS upload error:', {
      name: error.name,
      message: error.message,
      code: error.$metadata?.httpStatusCode,
      bucket: cosConfig.bucket,
      key,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
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
    const command = new PutObjectCommand({
      Bucket: cosConfig.bucket,
      Key: key,
      ContentType: contentType,
      Metadata: {
        'upload-timestamp': new Date().toISOString(),
        'upload-source': 'legalease-presigned',
      },
    });

    const uploadUrl = await getSignedUrl(cosClient, command, {
      expiresIn,
    });

    console.log(`✅ Presigned URL generated for: ${key}`);
    return {
      success: true,
      uploadUrl,
      key,
    };
  } catch (error: any) {
    console.error('❌ Presigned URL generation error:', error.message);
    return {
      success: false,
      error: error.message,
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
      Key: key,
    });

    return await getSignedUrl(cosClient, command, { expiresIn });
  } catch (error: any) {
    console.error('❌ Download URL generation error:', error.message);
    throw new Error(`Failed to generate download URL: ${error.message}`);
  }
}

/**
 * Delete a file from IBM COS
 */
export async function deleteFromCOS(key: string): Promise<boolean> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: cosConfig.bucket,
      Key: key,
    });
    await cosClient.send(command);
    console.log(`✅ File deleted successfully: ${key}`);
    return true;
  } catch (error: any) {
    console.error('❌ IBM COS delete error:', error.message);
    return false;
  }
}

/**
 * Check if a file exists in IBM COS
 */
export async function fileExistsInCOS(key: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: cosConfig.bucket,
      Key: key,
    });
    await cosClient.send(command);
    return true;
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
  return `documents/${userId}/${timestamp}-${sanitizedName}`;
}
