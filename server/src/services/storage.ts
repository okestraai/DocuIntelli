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

function buildPublicUrl(key: string): string {
  const base = cosConfig.publicEndpoint.replace(/\/$/, '');
  const hasBucketInEndpoint = new RegExp(`/${cosConfig.bucket}(/|$)`).test(base);
  const prefix = hasBucketInEndpoint ? base : `${base}/${cosConfig.bucket}`;
  return `${prefix}/${key}`;
}

interface S3ErrorDetails {
  name: string;
  message: string;
  code?: string;
  statusCode?: number;
  requestId?: string;
}

function extractS3ErrorDetails(error: unknown): S3ErrorDetails {
  const name = error instanceof Error ? error.name : 'UnknownError';
  const message = error instanceof Error ? error.message : 'Unexpected S3 error';
  const metadata =
    typeof error === 'object' && error !== null && '$metadata' in error
      ? (error as { $metadata?: { httpStatusCode?: number; requestId?: string } }).$metadata
      : undefined;

  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? (error as { code?: string }).code
      : undefined;

  return {
    name,
    message,
    code,
    statusCode: metadata?.httpStatusCode,
    requestId: metadata?.requestId,
  };
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

    const publicUrl = buildPublicUrl(key);

    console.log(`✅ Upload successful to IBM COS:`);
    console.log(`   - Key: ${key}`);
    console.log(`   - URL: ${publicUrl}`);
    console.log(`   - ETag: ${result.ETag}`);

    return {
      success: true,
      key,
      url: publicUrl,
    };
  } catch (error: unknown) {
    const details = extractS3ErrorDetails(error);

    console.error('❌ IBM COS upload error:', {
      ...details,
      bucket: cosConfig.bucket,
      key,
    });
    return {
      success: false,
      error: details.message,
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
    console.log(`📋 Content-Type: ${contentType}`);
    console.log(`⏰ Expires in: ${expiresIn} seconds`);

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

    console.log(`✅ Presigned URL generated:`);
    console.log(`   - Key: ${key}`);
    console.log(`   - URL: ${uploadUrl.substring(0, 100)}...`);
    console.log(`   - Expires: ${new Date(Date.now() + expiresIn * 1000).toISOString()}`);

    return {
      success: true,
      uploadUrl,
      key,
    };
  } catch (error: unknown) {
    const details = extractS3ErrorDetails(error);

    console.error('❌ Presigned URL generation error:', {
      ...details,
      bucket: cosConfig.bucket,
      key,
      contentType,
    });
    return {
      success: false,
      error: details.message,
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ Download URL generation error:', message);
    throw new Error(`Failed to generate download URL: ${message}`);
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('❌ IBM COS delete error:', message);
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
