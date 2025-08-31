// project/src/lib/api.ts
// Handles frontend API requests (upload, etc.)

export interface UploadResponse {
  file_key: string;
  public_url?: string;
  size?: string;
  file_type?: string;
}

/**
 * Upload a document with metadata via IBM COS presigned URL
 */
export async function uploadDocumentWithMetadata(file: File): Promise<UploadResponse> {
  // 1. Get presigned URL from backend
  const res = await fetch(
    `/api/signed-url?filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`,
    {
      headers: {
        // ✅ API key auth (from .env)
        Authorization: `Bearer ${import.meta.env.VITE_APP_UPLOAD_KEY}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to get presigned URL with status ${res.status}`);
  }

  const { data } = await res.json();
  const { upload_url, file_key } = data;

  // 2. Upload file directly to IBM COS
  const uploadRes = await fetch(upload_url, {
    method: "PUT",
    body: file,
    headers: {
      "Content-Type": file.type,
    },
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload failed with status ${uploadRes.status}`);
  }

  // 3. Return metadata
  return {
    file_key,
    public_url: upload_url.split("?")[0], // strip query params for clean URL
    size: `${(file.size / 1024).toFixed(1)} KB`,
    file_type: file.type,
  };
}
