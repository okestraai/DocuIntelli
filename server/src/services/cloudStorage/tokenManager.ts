import { query } from '../db';
import { getProvider } from './index';
import type { ConnectedSource, CloudStorageTokens } from './types';

/**
 * Get a valid (non-expired) access token for the user's cloud connection.
 * Auto-refreshes if the token is expired or about to expire (2-min buffer).
 */
export async function getValidAccessToken(userId: string, providerName: string): Promise<string> {
  const connection = await getConnection(userId, providerName);
  if (!connection) {
    throw new Error(`No ${providerName} connection found for user`);
  }
  if (connection.status !== 'active') {
    throw new Error(`${providerName} connection is ${connection.status}. Please reconnect.`);
  }

  // Check if token is still valid (with 2-min buffer)
  const bufferMs = 2 * 60 * 1000;
  if (connection.token_expires_at && connection.token_expires_at.getTime() > Date.now() + bufferMs) {
    // Update last_used_at
    await query('UPDATE connected_cloud_sources SET last_used_at = NOW() WHERE id = $1', [connection.id]);
    return connection.access_token;
  }

  // Token expired or about to expire — refresh it
  if (!connection.refresh_token) {
    // Mark as expired — user needs to reconnect
    await query(
      "UPDATE connected_cloud_sources SET status = 'expired' WHERE id = $1",
      [connection.id]
    );
    throw new Error(`${providerName} access expired. Please reconnect.`);
  }

  const provider = getProvider(providerName);
  const newTokens = await provider.refreshAccessToken(connection.refresh_token);

  await query(
    `UPDATE connected_cloud_sources
     SET access_token = $1, refresh_token = COALESCE($2, refresh_token),
         token_expires_at = $3, last_used_at = NOW(), updated_at = NOW()
     WHERE id = $4`,
    [newTokens.accessToken, newTokens.refreshToken || null, newTokens.expiresAt || null, connection.id]
  );

  return newTokens.accessToken;
}

/**
 * Save or update a cloud storage connection for a user.
 * Uses upsert (ON CONFLICT) since each user can have one connection per provider.
 */
export async function saveConnection(
  userId: string,
  providerName: string,
  tokens: CloudStorageTokens,
  email?: string
): Promise<string> {
  const result = await query(
    `INSERT INTO connected_cloud_sources (user_id, provider, access_token, refresh_token, token_expires_at, provider_email, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'active')
     ON CONFLICT (user_id, provider)
     DO UPDATE SET access_token = $3, refresh_token = COALESCE($4, connected_cloud_sources.refresh_token),
                   token_expires_at = $5, provider_email = COALESCE($6, connected_cloud_sources.provider_email),
                   status = 'active', connected_at = NOW(), updated_at = NOW()
     RETURNING id`,
    [userId, providerName, tokens.accessToken, tokens.refreshToken || null, tokens.expiresAt || null, email || null]
  );
  return result.rows[0].id;
}

/**
 * Remove (revoke) a cloud storage connection.
 */
export async function removeConnection(userId: string, providerName: string): Promise<void> {
  const connection = await getConnection(userId, providerName);
  if (!connection) return;

  // Best-effort revoke with the provider
  try {
    const provider = getProvider(providerName);
    await provider.revokeAccess(connection.access_token);
  } catch {
    // Revocation failure is non-fatal
  }

  await query(
    "UPDATE connected_cloud_sources SET status = 'revoked', access_token = '', updated_at = NOW() WHERE id = $1",
    [connection.id]
  );
}

/**
 * Get the cloud connection record for a user + provider.
 */
export async function getConnection(userId: string, providerName: string): Promise<ConnectedSource | null> {
  const result = await query(
    'SELECT * FROM connected_cloud_sources WHERE user_id = $1 AND provider = $2',
    [userId, providerName]
  );
  return result.rows[0] || null;
}

/**
 * Get all active connections for a user.
 */
export async function getUserConnections(userId: string): Promise<ConnectedSource[]> {
  const result = await query(
    "SELECT * FROM connected_cloud_sources WHERE user_id = $1 AND status = 'active' ORDER BY provider",
    [userId]
  );
  return result.rows;
}
