import {
  BlobServiceClient,
  ContainerClient,
  StorageSharedKeyCredential,
  generateBlobSASQueryParameters,
  BlobSASPermissions,
  SASProtocol,
} from '@azure/storage-blob';

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_STORAGE_CONTAINER || 'documents';

if (!connectionString) {
  console.error('Missing Azure Storage configuration: AZURE_STORAGE_CONNECTION_STRING');
  throw new Error('Missing AZURE_STORAGE_CONNECTION_STRING environment variable');
}

// Parse account name and key from connection string for SAS generation
function parseConnectionString(connStr: string): { accountName: string; accountKey: string } {
  const parts = connStr.split(';').reduce((acc: Record<string, string>, part) => {
    const idx = part.indexOf('=');
    if (idx > -1) {
      acc[part.substring(0, idx)] = part.substring(idx + 1);
    }
    return acc;
  }, {});
  return {
    accountName: parts['AccountName'] || '',
    accountKey: parts['AccountKey'] || '',
  };
}

const { accountName, accountKey } = parseConnectionString(connectionString);
const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const containerClient: ContainerClient = blobServiceClient.getContainerClient(containerName);

// Ensure container exists on startup
(async () => {
  try {
    await containerClient.createIfNotExists();
    console.log(`Azure Blob Storage initialized: container '${containerName}' ready`);
  } catch (err) {
    console.error('Failed to initialize Azure Blob Storage container:', err);
  }
})();

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

    console.log(`Uploading to Azure Blob Storage: ${filePath}`);

    const blockBlobClient = containerClient.getBlockBlobClient(filePath);
    await blockBlobClient.upload(file, file.length, {
      blobHTTPHeaders: { blobContentType: mimeType },
    });

    console.log(`File uploaded successfully: ${filePath}`);

    return {
      success: true,
      filePath,
      publicUrl: blockBlobClient.url,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload failed';
    console.error('Upload error:', error);
    return {
      success: false,
      error: message,
    };
  }
}

export async function deleteFromStorage(filePath: string): Promise<boolean> {
  try {
    const blockBlobClient = containerClient.getBlockBlobClient(filePath);
    await blockBlobClient.deleteIfExists();
    console.log(`File deleted: ${filePath}`);
    return true;
  } catch (error: unknown) {
    console.error('Delete error:', error);
    return false;
  }
}

export async function getSignedUrl(filePath: string, expiresIn: number = 3600): Promise<string> {
  try {
    const blobClient = containerClient.getBlobClient(filePath);

    const startsOn = new Date();
    const expiresOn = new Date(startsOn.getTime() + expiresIn * 1000);

    const sasToken = generateBlobSASQueryParameters(
      {
        containerName,
        blobName: filePath,
        permissions: BlobSASPermissions.parse('r'),
        startsOn,
        expiresOn,
        protocol: SASProtocol.Https,
      },
      sharedKeyCredential
    ).toString();

    return `${blobClient.url}?${sasToken}`;
  } catch (error: unknown) {
    console.error('Signed URL error:', error);
    throw error;
  }
}

export async function downloadFromStorage(filePath: string): Promise<Buffer> {
  try {
    const blockBlobClient = containerClient.getBlockBlobClient(filePath);
    const downloadResponse = await blockBlobClient.download(0);

    if (!downloadResponse.readableStreamBody) {
      throw new Error('No readable stream returned from blob download');
    }

    // Collect the stream into a Buffer
    const chunks: Buffer[] = [];
    for await (const chunk of downloadResponse.readableStreamBody) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    return Buffer.concat(chunks);
  } catch (error: unknown) {
    console.error('Download error:', error);
    throw error;
  }
}

export async function listBlobs(prefix: string): Promise<string[]> {
  try {
    const blobNames: string[] = [];
    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      blobNames.push(blob.name);
    }
    return blobNames;
  } catch (error: unknown) {
    console.error('List blobs error:', error);
    throw error;
  }
}
