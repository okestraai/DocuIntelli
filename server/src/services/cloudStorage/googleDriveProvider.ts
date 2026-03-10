import { CloudStorageProvider, CloudStorageTokens, CloudFile } from './types';

// Supported MIME types that match the upload pipeline
const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/msword', // DOC
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

// Google Workspace types that can be exported as PDF
const GOOGLE_EXPORT_TYPES: Record<string, string> = {
  'application/vnd.google-apps.document': 'application/pdf',
  'application/vnd.google-apps.spreadsheet': 'application/pdf',
  'application/vnd.google-apps.presentation': 'application/pdf',
};

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export class GoogleDriveProvider implements CloudStorageProvider {
  readonly providerName = 'google_drive';

  private get clientId(): string {
    return process.env.GOOGLE_CLIENT_ID || '';
  }

  private get clientSecret(): string {
    return process.env.GOOGLE_CLIENT_SECRET || '';
  }

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.readonly email',
      access_type: 'offline',
      prompt: 'consent',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    redirectUri: string
  ): Promise<CloudStorageTokens & { email?: string; accountId?: string }> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google token exchange failed: ${err}`);
    }

    const data: any = await res.json();
    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);

    // Get user email from the access token
    let email: string | undefined;
    try {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      if (userInfoRes.ok) {
        const userInfo: any = await userInfoRes.json();
        email = userInfo.email;
      }
    } catch {
      // Non-critical — email is informational only
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      email,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<CloudStorageTokens> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'refresh_token',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google token refresh failed: ${err}`);
    }

    const data: any = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken, // Google may not return a new refresh token
      expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    };
  }

  async listFiles(
    accessToken: string,
    folderId?: string,
    pageToken?: string
  ): Promise<{ files: CloudFile[]; nextPageToken?: string }> {
    // Build the query: files in the specified folder (or root), not trashed
    const parentClause = folderId ? `'${folderId}' in parents` : `'root' in parents`;
    const q = `${parentClause} and trashed = false`;

    const params = new URLSearchParams({
      q,
      fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents,iconLink)',
      pageSize: '50',
      orderBy: 'folder,name',
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Google Drive list files failed: ${err}`);
    }

    const data: any = await res.json();

    // Filter to folders + supported file types + exportable Google types
    const files: CloudFile[] = (data.files || [])
      .filter((f: any) => {
        if (f.mimeType === FOLDER_MIME_TYPE) return true;
        if (SUPPORTED_MIME_TYPES.has(f.mimeType)) return true;
        if (GOOGLE_EXPORT_TYPES[f.mimeType]) return true;
        return false;
      })
      .map((f: any) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: parseInt(f.size || '0', 10),
        modifiedTime: f.modifiedTime,
        iconUrl: f.iconLink,
        isFolder: f.mimeType === FOLDER_MIME_TYPE,
        parentId: f.parents?.[0],
      }));

    return {
      files,
      nextPageToken: data.nextPageToken || undefined,
    };
  }

  async downloadFile(
    accessToken: string,
    fileId: string
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    // First, get file metadata to determine type and name
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!metaRes.ok) {
      throw new Error(`Failed to get file metadata: ${await metaRes.text()}`);
    }

    const meta: any = await metaRes.json();
    const fileSize = parseInt(meta.size || '0', 10);

    // Enforce 50MB limit (matches multer upload limit)
    if (fileSize > 50 * 1024 * 1024) {
      throw new Error(`File too large (${Math.round(fileSize / 1024 / 1024)}MB). Maximum is 50MB.`);
    }

    let downloadUrl: string;
    let resultMimeType: string;

    if (GOOGLE_EXPORT_TYPES[meta.mimeType]) {
      // Google Docs/Sheets/Slides — export as PDF
      const exportMime = GOOGLE_EXPORT_TYPES[meta.mimeType];
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMime)}`;
      resultMimeType = exportMime;
    } else {
      // Regular file — direct download
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
      resultMimeType = meta.mimeType;
    }

    const res = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to download file: ${await res.text()}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      mimeType: resultMimeType,
      fileName: meta.name,
    };
  }

  async revokeAccess(accessToken: string): Promise<void> {
    try {
      await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );
    } catch {
      // Best-effort revocation — if it fails, the token will expire naturally
    }
  }
}
