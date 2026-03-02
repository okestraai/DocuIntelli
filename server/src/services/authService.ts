/**
 * Custom JWT Auth Service
 *
 * Handles password hashing, JWT access/refresh token management, and OTP
 * generation. Replaces Supabase Auth for all authentication operations.
 *
 * Dependencies: bcryptjs, jsonwebtoken, crypto (built-in)
 * Database: auth_users, auth_refresh_tokens, signup_otps (via ./db)
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from './db';

// ─── Environment ──────────────────────────────────────────────────────────────

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET) {
  console.error('FATAL: Missing JWT_SECRET environment variable');
}
if (!JWT_REFRESH_SECRET) {
  console.error('FATAL: Missing JWT_REFRESH_SECRET environment variable');
}

// ─── Token Payload Types ──────────────────────────────────────────────────────

interface AccessTokenPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}

interface RefreshTokenPayload {
  userId: string;
  tokenId: string;
  iat?: number;
  exp?: number;
}

// ─── Password Hashing ─────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 12;

/**
 * Hash a plaintext password using bcrypt with 12 rounds.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Verify a plaintext password against a bcrypt hash.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// ─── JWT Access Token ─────────────────────────────────────────────────────────

/**
 * Generate a short-lived access token (15 minutes).
 * Contains userId and email in the payload.
 */
export function generateAccessToken(userId: string, email: string): string {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');

  return jwt.sign(
    { userId, email } as AccessTokenPayload,
    JWT_SECRET,
    { expiresIn: '15m' }
  );
}

/**
 * Verify an access token and return the decoded payload.
 * Throws if the token is invalid, expired, or malformed.
 */
export function verifyAccessToken(token: string): { userId: string; email: string } {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not configured');

  const decoded = jwt.verify(token, JWT_SECRET) as AccessTokenPayload;

  if (!decoded.userId || !decoded.email) {
    throw new Error('Invalid token payload');
  }

  return { userId: decoded.userId, email: decoded.email };
}

// ─── JWT Refresh Token ────────────────────────────────────────────────────────

const REFRESH_TOKEN_EXPIRY_DAYS = 7;

/**
 * Generate a refresh token (7-day expiry).
 * The token is a JWT containing a unique tokenId. The SHA-256 hash of the
 * full JWT string is stored in auth_refresh_tokens for server-side validation.
 *
 * Returns the raw JWT string to send to the client.
 */
export async function generateRefreshToken(userId: string): Promise<string> {
  if (!JWT_REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET not configured');

  const tokenId = crypto.randomUUID();

  const token = jwt.sign(
    { userId, tokenId } as RefreshTokenPayload,
    JWT_REFRESH_SECRET,
    { expiresIn: `${REFRESH_TOKEN_EXPIRY_DAYS}d` }
  );

  // Store the hash of the token in the database
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  await query(
    `INSERT INTO auth_refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt.toISOString()]
  );

  return token;
}

/**
 * Verify a refresh token.
 * Checks that the token:
 *  1. Is a valid JWT signed with JWT_REFRESH_SECRET
 *  2. Has a matching, non-revoked, non-expired record in auth_refresh_tokens
 *
 * Returns the userId if valid. Throws otherwise.
 */
export async function verifyRefreshToken(token: string): Promise<{ userId: string }> {
  if (!JWT_REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET not configured');

  // Step 1: Verify JWT signature and expiry
  const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as RefreshTokenPayload;

  if (!decoded.userId || !decoded.tokenId) {
    throw new Error('Invalid refresh token payload');
  }

  // Step 2: Check the database for the token hash
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const result = await query(
    `SELECT id, user_id, revoked, expires_at
     FROM auth_refresh_tokens
     WHERE token_hash = $1 AND user_id = $2`,
    [tokenHash, decoded.userId]
  );

  if (result.rows.length === 0) {
    throw new Error('Refresh token not found');
  }

  const record = result.rows[0];

  if (record.revoked) {
    throw new Error('Refresh token has been revoked');
  }

  if (new Date(record.expires_at) < new Date()) {
    throw new Error('Refresh token has expired');
  }

  return { userId: decoded.userId };
}

// ─── Token Revocation ─────────────────────────────────────────────────────────

/**
 * Revoke a single refresh token by its raw JWT string.
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  await query(
    `UPDATE auth_refresh_tokens SET revoked = true WHERE token_hash = $1`,
    [tokenHash]
  );
}

/**
 * Revoke all refresh tokens for a given user (e.g., password reset, logout-all).
 */
export async function revokeAllUserTokens(userId: string): Promise<void> {
  await query(
    `UPDATE auth_refresh_tokens SET revoked = true WHERE user_id = $1 AND revoked = false`,
    [userId]
  );
}

/**
 * Delete expired and revoked tokens from auth_refresh_tokens.
 * Intended for scheduled cleanup jobs.
 */
export async function cleanExpiredTokens(): Promise<void> {
  await query(
    `DELETE FROM auth_refresh_tokens
     WHERE expires_at < NOW()
        OR (revoked = true AND created_at < NOW() - interval '1 day')`
  );
}

// ─── OTP Management ───────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random 6-digit OTP.
 */
export function generateOTP(): string {
  // Generate a random integer between 100000 and 999999
  const bytes = crypto.randomBytes(4);
  const num = bytes.readUInt32BE(0);
  const otp = 100000 + (num % 900000);
  return otp.toString();
}

/**
 * Hash an OTP using SHA-256.
 * Used for secure storage in signup_otps table.
 */
export function hashOTP(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

// ─── Google ID Token Verification ─────────────────────────────────────────────

interface GoogleTokenPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  given_name?: string;
  family_name?: string;
}

/**
 * Verify a Google ID token by fetching Google's public keys and
 * validating the token. Returns the decoded payload if valid.
 *
 * This avoids importing the full google-auth-library by calling
 * Google's tokeninfo endpoint directly.
 */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenPayload> {
  const response = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Google token verification failed: ${errorBody}`);
  }

  const payload = await response.json() as Record<string, string>;

  // Validate required fields
  if (!payload.sub || !payload.email) {
    throw new Error('Google token missing required fields (sub, email)');
  }

  // Validate audience matches our Google Client ID (if configured)
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  if (googleClientId && payload.aud !== googleClientId) {
    throw new Error('Google token audience mismatch');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    email_verified: payload.email_verified === 'true',
    name: payload.name || undefined,
    picture: payload.picture || undefined,
    given_name: payload.given_name || undefined,
    family_name: payload.family_name || undefined,
  };
}
