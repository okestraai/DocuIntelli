/**
 * Impersonation Detection Middleware
 *
 * Checks for the X-Impersonation-Proof header which contains an HMAC-signed
 * token generated when an admin initiates impersonation. If the token is valid
 * (correct HMAC, matching user ID, not expired), sets req.isImpersonated = true.
 *
 * This flag is used downstream to:
 *  - Skip chat message persistence (so impersonation chats don't pollute user history)
 *  - Skip AI question / upload quota increments (admin testing shouldn't cost the user)
 *  - Skip usage log entries
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const IMPERSONATION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate an HMAC-signed impersonation proof token.
 * Called by the admin impersonate endpoint.
 */
export function generateImpersonationProof(adminId: string, targetUserId: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for impersonation');

  const timestamp = Date.now().toString();
  const payload = `${adminId}:${targetUserId}:${timestamp}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${signature}`).toString('base64');
}

/**
 * Verify an impersonation proof token.
 * Returns { valid: true, adminId, targetUserId } if valid, or { valid: false } otherwise.
 */
function verifyImpersonationProof(
  token: string,
  authenticatedUserId: string
): { valid: boolean; adminId?: string; targetUserId?: string } {
  try {
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secret) return { valid: false };

    const decoded = Buffer.from(token, 'base64').toString();
    const parts = decoded.split(':');
    if (parts.length !== 4) return { valid: false };

    const [adminId, targetUserId, timestamp, signature] = parts;

    // Verify the target user matches the authenticated user
    if (targetUserId !== authenticatedUserId) return { valid: false };

    // Verify not expired
    const age = Date.now() - parseInt(timestamp, 10);
    if (isNaN(age) || age < 0 || age > IMPERSONATION_MAX_AGE_MS) return { valid: false };

    // Verify HMAC signature
    const payload = `${adminId}:${targetUserId}:${timestamp}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      return { valid: false };
    }

    return { valid: true, adminId, targetUserId };
  } catch {
    return { valid: false };
  }
}

/**
 * Express middleware: detect and verify impersonation.
 * Sets req.isImpersonated = true if a valid proof token is present.
 * Non-blocking — never rejects the request, just sets the flag.
 */
export function detectImpersonation(req: Request, _res: Response, next: NextFunction): void {
  const proof = req.headers['x-impersonation-proof'] as string | undefined;
  if (proof && req.userId) {
    const result = verifyImpersonationProof(proof, req.userId);
    if (result.valid) {
      req.isImpersonated = true;
    }
  }
  next();
}
