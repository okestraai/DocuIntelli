export interface CloudFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string;
  iconUrl?: string;
  isFolder: boolean;
  parentId?: string;
}

export interface CloudStorageTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

export interface CloudStorageProvider {
  readonly providerName: string;

  /** Generate the OAuth authorization URL */
  getAuthUrl(state: string, redirectUri: string): string;

  /** Exchange an authorization code for tokens */
  exchangeCode(
    code: string,
    redirectUri: string
  ): Promise<CloudStorageTokens & { email?: string; accountId?: string }>;

  /** Refresh an expired access token */
  refreshAccessToken(refreshToken: string): Promise<CloudStorageTokens>;

  /** List files in a folder (or root). Supports pagination via pageToken. */
  listFiles(
    accessToken: string,
    folderId?: string,
    pageToken?: string
  ): Promise<{ files: CloudFile[]; nextPageToken?: string }>;

  /** Download a file's content as a Buffer */
  downloadFile(
    accessToken: string,
    fileId: string
  ): Promise<{ buffer: Buffer; mimeType: string; fileName: string }>;

  /** Revoke the provider tokens */
  revokeAccess(accessToken: string): Promise<void>;
}

export interface ConnectedSource {
  id: string;
  user_id: string;
  provider: string;
  provider_email: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: Date | null;
  status: string;
  connected_at: Date;
  last_used_at: Date | null;
}
