// src/lib/api.ts
// Frontend API helpers

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
  const res = await fetch(
    `http://localhost:5000/api/signed-url?filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`,
    {
      headers: {
        Authorization: `Bearer ${import.meta.env.VITE_APP_UPLOAD_KEY}`,
      },
    }
  );

  if (!res.ok) {
    throw new Error(`Failed to get presigned URL with status ${res.status}`);
  }

  const { data } = await res.json();
  const { upload_url, file_key } = data;

  const uploadRes = await fetch(upload_url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });

  if (!uploadRes.ok) {
    throw new Error(`Upload failed with status ${uploadRes.status}`);
  }

  return {
    file_key,
    public_url: upload_url.split("?")[0],
    size: `${(file.size / 1024).toFixed(1)} KB`,
    file_type: file.type,
  };
}

/**
 * Search user documents (delegates to backend Supabase query)
 */
export async function searchDocuments(query: string) {
  const res = await fetch(`http://localhost:5000/api/documents/search?q=${encodeURIComponent(query)}`, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_APP_UPLOAD_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to search documents: ${res.status}`);
  }

  return res.json();
}

/**
 * Get presigned download URL for a document
 */
export async function getDocumentDownloadUrl(documentId: string) {
  const res = await fetch(`http://localhost:5000/api/documents/${documentId}/download`, {
    headers: {
      Authorization: `Bearer ${import.meta.env.VITE_APP_UPLOAD_KEY}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to get download URL: ${res.status}`);
  }

  return res.json();
}
