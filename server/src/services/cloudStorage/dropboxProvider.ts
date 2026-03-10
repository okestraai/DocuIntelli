import { CloudStorageProvider, CloudStorageTokens, CloudFile } from './types';

// File extensions that match the upload pipeline
const SUPPORTED_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.doc',
  '.txt',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
]);

// Map common extensions to MIME types
const EXT_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.txt': 'text/plain',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

function getExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.substring(dot).toLowerCase() : '';
}

export class DropboxProvider implements CloudStorageProvider {
  readonly providerName = 'dropbox';

  private get clientId(): string {
    return process.env.DROPBOX_CLIENT_ID || '';
  }

  private get clientSecret(): string {
    return process.env.DROPBOX_CLIENT_SECRET || '';
  }

  getAuthUrl(state: string, redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      token_access_type: 'offline',
      state,
    });
    return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCode(
    code: string,
    redirectUri: string
  ): Promise<CloudStorageTokens & { email?: string; accountId?: string }> {
    const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Dropbox token exchange failed: ${err}`);
    }

    const data: any = await res.json();
    const expiresAt = new Date(Date.now() + (data.expires_in || 14400) * 1000);

    // Get user email
    let email: string | undefined;
    let accountId: string | undefined;
    try {
      const userRes = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.access_token}` },
      });
      if (userRes.ok) {
        const userInfo: any = await userRes.json();
        email = userInfo.email;
        accountId = userInfo.account_id;
      }
    } catch {
      // Non-critical
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
      email,
      accountId,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<CloudStorageTokens> {
    const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Dropbox token refresh failed: ${err}`);
    }

    const data: any = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken, // Dropbox doesn't return a new refresh token
      expiresAt: new Date(Date.now() + (data.expires_in || 14400) * 1000),
    };
  }

  async listFiles(
    accessToken: string,
    folderId?: string,
    pageToken?: string
  ): Promise<{ files: CloudFile[]; nextPageToken?: string }> {
    let res: Response;

    if (pageToken) {
      // Continue from cursor
      res = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cursor: pageToken }),
      });
    } else {
      // Initial listing — use folderId as path, default to root ("")
      res = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: folderId || '',
          limit: 50,
          include_mounted_folders: true,
        }),
      });
    }

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Dropbox list files failed: ${err}`);
    }

    const data: any = await res.json();

    // Filter to folders + supported file types
    const files: CloudFile[] = (data.entries || [])
      .filter((entry: any) => {
        if (entry['.tag'] === 'folder') return true;
        const ext = getExtension(entry.name);
        return SUPPORTED_EXTENSIONS.has(ext);
      })
      .map((entry: any) => {
        const isFolder = entry['.tag'] === 'folder';
        const ext = getExtension(entry.name);
        return {
          id: entry.id, // Dropbox file ID (e.g. "id:abc123")
          name: entry.name,
          mimeType: isFolder ? 'folder' : (EXT_TO_MIME[ext] || 'application/octet-stream'),
          size: entry.size || 0,
          modifiedTime: entry.client_modified || entry.server_modified || '',
          isFolder,
        };
      });

    // Sort: folders first, then files by name
    files.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return {
      files,
      nextPageToken: data.has_more ? data.cursor : undefined,
    };
  }

  async downloadFile(
    accessToken: string,
    fileId: string
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }> {
    // Dropbox download uses the Dropbox-API-Arg header for parameters
    const res = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Dropbox-API-Arg': JSON.stringify({ path: fileId }),
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Dropbox download failed: ${err}`);
    }

    // Parse metadata from response header
    const metaHeader = res.headers.get('dropbox-api-result');
    let fileName = 'download';
    if (metaHeader) {
      try {
        const meta = JSON.parse(metaHeader);
        fileName = meta.name || fileName;
        // Enforce 50MB limit
        if (meta.size && meta.size > 50 * 1024 * 1024) {
          throw new Error(`File too large (${Math.round(meta.size / 1024 / 1024)}MB). Maximum is 50MB.`);
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('too large')) throw e;
      }
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Enforce size limit for files without metadata header
    if (buffer.length > 50 * 1024 * 1024) {
      throw new Error(`File too large (${Math.round(buffer.length / 1024 / 1024)}MB). Maximum is 50MB.`);
    }

    const ext = getExtension(fileName);
    const mimeType = EXT_TO_MIME[ext] || 'application/octet-stream';

    return { buffer, mimeType, fileName };
  }

  async revokeAccess(accessToken: string): Promise<void> {
    try {
      await fetch('https://api.dropboxapi.com/oauth2/token/revoke', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {
      // Best-effort revocation
    }
  }
}
