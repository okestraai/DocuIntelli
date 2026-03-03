/**
 * Auth Routes — Custom JWT Authentication
 *
 * Handles signup, login, OTP verification, token refresh, logout,
 * password reset, Google OAuth, and user info retrieval.
 *
 * These routes do NOT require loadSubscription middleware.
 * Only GET /me uses token verification.
 */

import { Router, Request, Response } from 'express';
import { query, getClient } from '../services/db';
import {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
  generateOTP,
  hashOTP,
  verifyGoogleIdToken,
} from '../services/authService';
import nodemailer from 'nodemailer';

const router = Router();

// ─── OTP Email Helper ─────────────────────────────────────────────────────────

const SMTP_HOST = process.env.SMTP_HOST || 'in-v3.mailjet.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587', 10);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@docuintelli.com';
const FROM_NAME = process.env.FROM_NAME || 'DocuIntelli AI';

let otpTransporter: nodemailer.Transporter | null = null;

function getOtpTransporter(): nodemailer.Transporter {
  if (!otpTransporter) {
    otpTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      tls: { ciphers: 'SSLv3', rejectUnauthorized: false },
    });
  }
  return otpTransporter;
}

async function sendOtpEmail(email: string, otp: string): Promise<void> {
  const transport = getOtpTransporter();
  await transport.sendMail({
    from: `"${FROM_NAME}" <${FROM_EMAIL}>`,
    to: email,
    subject: 'Your DocuIntelli verification code',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#059669;margin-bottom:16px">Verify your email</h2>
        <p style="color:#334155;font-size:16px;line-height:1.5">
          Your verification code is:
        </p>
        <div style="background:#f1f5f9;border-radius:12px;padding:24px;text-align:center;margin:24px 0">
          <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#0f172a">${otp}</span>
        </div>
        <p style="color:#64748b;font-size:14px;line-height:1.5">
          This code expires in 30 minutes. If you didn't request this, you can safely ignore this email.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
        <p style="color:#94a3b8;font-size:12px">DocuIntelli AI &mdash; Your intelligent document vault</p>
      </div>
    `,
  });
}

// ─── POST /api/auth/signup ──────────────────────────────────────────────────

router.post('/signup', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, display_name } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existing = await query(
      'SELECT id, email_confirmed FROM auth_users WHERE email = $1',
      [normalizedEmail]
    );

    if (existing.rows.length > 0) {
      const existingUser = existing.rows[0];
      if (existingUser.email_confirmed) {
        res.status(409).json({ error: 'An account with this email already exists' });
        return;
      }
      // User exists but not confirmed — update password and resend OTP
      const passwordHash = await hashPassword(password);
      await query(
        `UPDATE auth_users SET password_hash = $1, updated_at = NOW()
         WHERE id = $2`,
        [passwordHash, existingUser.id]
      );
    } else {
      // Create new user
      const passwordHash = await hashPassword(password);
      const metadata: Record<string, string> = {};
      if (display_name) metadata.display_name = display_name;

      await query(
        `INSERT INTO auth_users (email, password_hash, email_confirmed, provider, raw_user_meta_data)
         VALUES ($1, $2, false, 'email', $3)`,
        [normalizedEmail, passwordHash, JSON.stringify(metadata)]
      );
    }

    // Generate and store OTP in signup_otps table
    const otp = generateOTP();
    const otpHash = hashOTP(otp);

    // Mark any previous OTPs for this email as used
    await query(
      `UPDATE signup_otps SET is_used = true WHERE email = $1 AND is_used = false`,
      [normalizedEmail]
    );

    // Insert new OTP — note: password_encrypted and password_iv are legacy columns
    // from the old Supabase edge function flow. We store empty strings since the
    // password is already hashed in auth_users.
    await query(
      `INSERT INTO signup_otps (email, otp_hash, password_encrypted, password_iv, expires_at)
       VALUES ($1, $2, '', '', NOW() + interval '30 minutes')`,
      [normalizedEmail, otpHash]
    );

    // Send OTP email
    try {
      await sendOtpEmail(normalizedEmail, otp);
    } catch (emailErr) {
      console.error('Failed to send OTP email:', emailErr);
      res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
      return;
    }

    res.json({ success: true, message: 'Verification code sent to your email' });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Signup failed. Please try again.' });
  }
});

// ─── POST /api/auth/verify-otp ──────────────────────────────────────────────

router.post('/verify-otp', async (req: Request, res: Response): Promise<void> => {
  try {
    // Accept both 'otp' and 'token' field names for compatibility
    const { email, otp: otpField, token: tokenField } = req.body;
    const otp = otpField || tokenField;

    if (!email || !otp) {
      res.status(400).json({ error: 'Email and verification code are required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const otpHash = hashOTP(otp);

    // Find the most recent valid OTP for this email
    const otpResult = await query(
      `SELECT id, attempts FROM signup_otps
       WHERE email = $1 AND otp_hash = $2 AND is_used = false AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedEmail, otpHash]
    );

    if (otpResult.rows.length === 0) {
      // Check if there's a non-expired OTP with wrong code (for attempt tracking)
      const pendingOtp = await query(
        `SELECT id, attempts FROM signup_otps
         WHERE email = $1 AND is_used = false AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [normalizedEmail]
      );

      if (pendingOtp.rows.length > 0) {
        const attempts = pendingOtp.rows[0].attempts + 1;
        await query(
          `UPDATE signup_otps SET attempts = $1, updated_at = NOW() WHERE id = $2`,
          [attempts, pendingOtp.rows[0].id]
        );

        if (attempts >= 5) {
          await query(
            `UPDATE signup_otps SET is_used = true WHERE id = $1`,
            [pendingOtp.rows[0].id]
          );
          res.status(429).json({ error: 'Too many attempts. Please request a new verification code.' });
          return;
        }
      }

      res.status(400).json({ error: 'Invalid or expired verification code' });
      return;
    }

    // Mark OTP as used
    await query(
      `UPDATE signup_otps SET is_used = true, updated_at = NOW() WHERE id = $1`,
      [otpResult.rows[0].id]
    );

    // Get the user and confirm their email
    const userResult = await query(
      `UPDATE auth_users SET email_confirmed = true, updated_at = NOW()
       WHERE email = $1
       RETURNING id, email, raw_user_meta_data`,
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = userResult.rows[0];
    const displayName = user.raw_user_meta_data?.display_name || '';

    // Create initial user_profiles and user_subscriptions records
    // (replaces the old auth.users trigger functions)
    const client = await getClient();
    try {
      await client.query('BEGIN');

      // Create user profile
      await client.query(
        `INSERT INTO user_profiles (id, display_name, email_notifications, document_reminders, security_alerts)
         VALUES ($1, $2, true, true, true)
         ON CONFLICT (id) DO NOTHING`,
        [user.id, displayName]
      );

      // Create free subscription
      await client.query(
        `INSERT INTO user_subscriptions (user_id, plan, status)
         VALUES ($1, 'free', 'active')
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id]
      );

      await client.query('COMMIT');
    } catch (initErr) {
      await client.query('ROLLBACK');
      console.error('Error initializing user records:', initErr);
      // Non-fatal — user is confirmed, records will be created by loadSubscription if needed
    } finally {
      client.release();
    }

    // Generate tokens
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = await generateRefreshToken(user.id);

    res.json({
      success: true,
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        display_name: displayName,
      },
    });
  } catch (err) {
    console.error('OTP verification error:', err);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// ─── POST /api/auth/login ───────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user
    const userResult = await query(
      `SELECT id, email, password_hash, email_confirmed, provider, raw_user_meta_data
       FROM auth_users WHERE email = $1`,
      [normalizedEmail]
    );

    if (userResult.rows.length === 0) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const user = userResult.rows[0];

    // No password hash — either OAuth-only user or migrated user whose hash wasn't transferred
    if (!user.password_hash) {
      if (user.provider && user.provider !== 'email') {
        res.status(401).json({
          error: `This account uses ${user.provider} sign-in. Please sign in with ${user.provider}.`,
        });
      } else {
        // Migrated email user without a password — prompt them to reset
        res.status(401).json({
          error: 'Your password needs to be reset. Please use "Forgot Password" to set a new password.',
          code: 'PASSWORD_RESET_REQUIRED',
        });
      }
      return;
    }

    // Verify password
    const passwordValid = await verifyPassword(password, user.password_hash);
    if (!passwordValid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    // Check email confirmation
    if (!user.email_confirmed) {
      res.status(401).json({
        error: 'Please verify your email before signing in',
        code: 'EMAIL_NOT_CONFIRMED',
      });
      return;
    }

    // Generate tokens
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = await generateRefreshToken(user.id);

    const displayName = user.raw_user_meta_data?.display_name || '';

    res.json({
      success: true,
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        display_name: displayName,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ─── POST /api/auth/refresh ─────────────────────────────────────────────────

router.post('/refresh', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    // Verify the refresh token
    const { userId } = await verifyRefreshToken(refresh_token);

    // Get current user info for the new access token
    const userResult = await query(
      'SELECT id, email FROM auth_users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    const user = userResult.rows[0];

    // Revoke the old refresh token and issue a new one (token rotation)
    await revokeRefreshToken(refresh_token);

    const newAccessToken = generateAccessToken(user.id, user.email);
    const newRefreshToken = await generateRefreshToken(user.id);

    res.json({
      success: true,
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    });
  } catch (err: any) {
    console.error('Token refresh error:', err.message);
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// ─── POST /api/auth/logout ──────────────────────────────────────────────────

router.post('/logout', async (req: Request, res: Response): Promise<void> => {
  try {
    const { refresh_token } = req.body;

    if (refresh_token) {
      await revokeRefreshToken(refresh_token);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err);
    // Still return success — the client should clear tokens regardless
    res.json({ success: true });
  }
});

// ─── POST /api/auth/send-otp ───────────────────────────────────────────────

router.post('/send-otp', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ error: 'Email is required' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Rate limit: max 3 OTPs per email per 15 minutes
    const recentOtps = await query(
      `SELECT COUNT(*)::int AS count FROM signup_otps
       WHERE email = $1 AND created_at > NOW() - interval '15 minutes'`,
      [normalizedEmail]
    );

    if (recentOtps.rows[0]?.count >= 3) {
      res.status(429).json({ error: 'Too many requests. Please wait before requesting a new code.' });
      return;
    }

    // Mark previous OTPs as used
    await query(
      `UPDATE signup_otps SET is_used = true WHERE email = $1 AND is_used = false`,
      [normalizedEmail]
    );

    // Generate and store new OTP
    const otp = generateOTP();
    const otpHash = hashOTP(otp);

    await query(
      `INSERT INTO signup_otps (email, otp_hash, password_encrypted, password_iv, expires_at)
       VALUES ($1, $2, '', '', NOW() + interval '30 minutes')`,
      [normalizedEmail, otpHash]
    );

    // Send OTP email
    try {
      await sendOtpEmail(normalizedEmail, otp);
    } catch (emailErr) {
      console.error('Failed to send OTP email:', emailErr);
      res.status(500).json({ error: 'Failed to send verification email' });
      return;
    }

    res.json({ success: true, message: 'Verification code sent' });
  } catch (err) {
    console.error('Send OTP error:', err);
    res.status(500).json({ error: 'Failed to send verification code' });
  }
});

// ─── POST /api/auth/reset-password ──────────────────────────────────────────

router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, otp, new_password } = req.body;

    if (!email || !otp || !new_password) {
      res.status(400).json({ error: 'Email, verification code, and new password are required' });
      return;
    }

    if (new_password.length < 8) {
      res.status(400).json({ error: 'Password must be at least 8 characters' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const otpHash = hashOTP(otp);

    // Verify OTP
    const otpResult = await query(
      `SELECT id FROM signup_otps
       WHERE email = $1 AND otp_hash = $2 AND is_used = false AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [normalizedEmail, otpHash]
    );

    if (otpResult.rows.length === 0) {
      res.status(400).json({ error: 'Invalid or expired verification code' });
      return;
    }

    // Mark OTP as used
    await query(
      `UPDATE signup_otps SET is_used = true, updated_at = NOW() WHERE id = $1`,
      [otpResult.rows[0].id]
    );

    // Update password
    const passwordHash = await hashPassword(new_password);

    const updateResult = await query(
      `UPDATE auth_users SET password_hash = $1, updated_at = NOW()
       WHERE email = $2
       RETURNING id`,
      [passwordHash, normalizedEmail]
    );

    if (updateResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const userId = updateResult.rows[0].id;

    // Revoke all existing refresh tokens (force re-login on all devices)
    await revokeAllUserTokens(userId);

    res.json({ success: true, message: 'Password has been reset. Please sign in with your new password.' });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ error: 'Password reset failed. Please try again.' });
  }
});

// ─── GET /api/auth/google — Initiate OAuth redirect ─────────────────────────

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const APP_URL = process.env.APP_URL || 'https://docuintelli.com';

router.get('/google', async (req: Request, res: Response): Promise<void> => {
  try {
    if (!GOOGLE_CLIENT_ID) {
      res.status(500).json({ error: 'Google OAuth is not configured' });
      return;
    }

    const redirectTo = (req.query.redirect_to as string) || APP_URL;
    const accessType = (req.query.access_type as string) || 'offline';
    const prompt = (req.query.prompt as string) || 'consent';

    // Encode redirect_to into state parameter (signed JWT to prevent CSRF)
    const jwt = await import('jsonwebtoken');
    const state = jwt.default.sign(
      { redirect_to: redirectTo },
      process.env.JWT_SECRET!,
      { expiresIn: '10m' }
    );

    const callbackUrl = `${APP_URL}/api/auth/google/callback`;

    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: accessType,
      prompt,
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  } catch (err) {
    console.error('Google OAuth redirect error:', err);
    res.status(500).json({ error: 'Failed to initiate Google sign-in' });
  }
});

// ─── GET /api/auth/google/callback — Handle Google OAuth callback ───────────

router.get('/google/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
      console.error('Google OAuth error:', oauthError);
      res.redirect(`${APP_URL}?auth_error=${encodeURIComponent(String(oauthError))}`);
      return;
    }

    if (!code || !state) {
      res.redirect(`${APP_URL}?auth_error=missing_code`);
      return;
    }

    // Verify the state parameter to prevent CSRF
    const jwt = await import('jsonwebtoken');
    let statePayload: { redirect_to: string };
    try {
      statePayload = jwt.default.verify(String(state), process.env.JWT_SECRET!) as { redirect_to: string };
    } catch {
      res.redirect(`${APP_URL}?auth_error=invalid_state`);
      return;
    }

    const callbackUrl = `${APP_URL}/api/auth/google/callback`;

    // Exchange authorization code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      console.error('Google token exchange failed:', errBody);
      res.redirect(`${APP_URL}?auth_error=token_exchange_failed`);
      return;
    }

    const tokenData = await tokenRes.json() as { id_token?: string };
    const idToken = tokenData.id_token;

    if (!idToken) {
      res.redirect(`${APP_URL}?auth_error=no_id_token`);
      return;
    }

    // Verify the Google ID token
    const googlePayload = await verifyGoogleIdToken(idToken);

    if (!googlePayload.email_verified) {
      res.redirect(`${APP_URL}?auth_error=email_not_verified`);
      return;
    }

    const normalizedEmail = googlePayload.email.toLowerCase().trim();

    // Find or create user (same logic as POST /google)
    let user: { id: string; email: string; raw_user_meta_data: Record<string, string> };

    const existingUser = await query(
      `SELECT id, email, raw_user_meta_data FROM auth_users
       WHERE (provider = 'google' AND provider_id = $1)
          OR email = $2
       ORDER BY provider = 'google' DESC
       LIMIT 1`,
      [googlePayload.sub, normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      user = existingUser.rows[0];

      // Update provider info if this was originally an email user
      await query(
        `UPDATE auth_users
         SET provider = 'google',
             provider_id = $1,
             email_confirmed = true,
             raw_user_meta_data = raw_user_meta_data || $2::jsonb,
             updated_at = NOW()
         WHERE id = $3`,
        [
          googlePayload.sub,
          JSON.stringify({
            display_name: googlePayload.name || user.raw_user_meta_data?.display_name || '',
            avatar_url: googlePayload.picture || '',
            full_name: googlePayload.name || '',
          }),
          user.id,
        ]
      );
    } else {
      // Create new user
      const metadata = {
        display_name: googlePayload.name || '',
        avatar_url: googlePayload.picture || '',
        full_name: googlePayload.name || '',
      };

      const insertResult = await query(
        `INSERT INTO auth_users (email, email_confirmed, provider, provider_id, raw_user_meta_data)
         VALUES ($1, true, 'google', $2, $3)
         RETURNING id, email, raw_user_meta_data`,
        [normalizedEmail, googlePayload.sub, JSON.stringify(metadata)]
      );

      user = insertResult.rows[0];

      // Create initial user_profiles and user_subscriptions
      const client = await getClient();
      try {
        await client.query('BEGIN');

        await client.query(
          `INSERT INTO user_profiles (id, display_name, full_name, avatar_url, email_notifications, document_reminders, security_alerts)
           VALUES ($1, $2, $3, $4, true, true, true)
           ON CONFLICT (id) DO NOTHING`,
          [user.id, googlePayload.name || '', googlePayload.name || '', googlePayload.picture || '']
        );

        await client.query(
          `INSERT INTO user_subscriptions (user_id, plan, status)
           VALUES ($1, 'free', 'active')
           ON CONFLICT (user_id) DO NOTHING`,
          [user.id]
        );

        await client.query('COMMIT');
      } catch (initErr) {
        await client.query('ROLLBACK');
        console.error('Error initializing Google user records:', initErr);
      } finally {
        client.release();
      }
    }

    // Generate JWT tokens
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = await generateRefreshToken(user.id);

    // Redirect to frontend with tokens in query params
    const redirectUrl = new URL(statePayload.redirect_to || APP_URL);
    redirectUrl.searchParams.set('access_token', accessToken);
    redirectUrl.searchParams.set('refresh_token', refreshToken);

    res.redirect(redirectUrl.toString());
  } catch (err) {
    console.error('Google OAuth callback error:', err);
    res.redirect(`${APP_URL}?auth_error=callback_failed`);
  }
});

// ─── POST /api/auth/google ──────────────────────────────────────────────────

router.post('/google', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id_token } = req.body;

    if (!id_token) {
      res.status(400).json({ error: 'Google ID token is required' });
      return;
    }

    // Verify Google ID token
    const googlePayload = await verifyGoogleIdToken(id_token);

    if (!googlePayload.email_verified) {
      res.status(400).json({ error: 'Google email not verified' });
      return;
    }

    const normalizedEmail = googlePayload.email.toLowerCase().trim();

    // Find or create user
    let user: { id: string; email: string; raw_user_meta_data: Record<string, string> };

    const existingUser = await query(
      `SELECT id, email, raw_user_meta_data FROM auth_users
       WHERE (provider = 'google' AND provider_id = $1)
          OR email = $2
       ORDER BY provider = 'google' DESC
       LIMIT 1`,
      [googlePayload.sub, normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      user = existingUser.rows[0];

      // Update provider info if this was originally an email user
      await query(
        `UPDATE auth_users
         SET provider = 'google',
             provider_id = $1,
             email_confirmed = true,
             raw_user_meta_data = raw_user_meta_data || $2::jsonb,
             updated_at = NOW()
         WHERE id = $3`,
        [
          googlePayload.sub,
          JSON.stringify({
            display_name: googlePayload.name || user.raw_user_meta_data?.display_name || '',
            avatar_url: googlePayload.picture || '',
            full_name: googlePayload.name || '',
          }),
          user.id,
        ]
      );
    } else {
      // Create new user
      const metadata = {
        display_name: googlePayload.name || '',
        avatar_url: googlePayload.picture || '',
        full_name: googlePayload.name || '',
      };

      const insertResult = await query(
        `INSERT INTO auth_users (email, email_confirmed, provider, provider_id, raw_user_meta_data)
         VALUES ($1, true, 'google', $2, $3)
         RETURNING id, email, raw_user_meta_data`,
        [normalizedEmail, googlePayload.sub, JSON.stringify(metadata)]
      );

      user = insertResult.rows[0];

      // Create initial user_profiles and user_subscriptions
      const client = await getClient();
      try {
        await client.query('BEGIN');

        await client.query(
          `INSERT INTO user_profiles (id, display_name, full_name, avatar_url, email_notifications, document_reminders, security_alerts)
           VALUES ($1, $2, $3, $4, true, true, true)
           ON CONFLICT (id) DO NOTHING`,
          [user.id, googlePayload.name || '', googlePayload.name || '', googlePayload.picture || '']
        );

        await client.query(
          `INSERT INTO user_subscriptions (user_id, plan, status)
           VALUES ($1, 'free', 'active')
           ON CONFLICT (user_id) DO NOTHING`,
          [user.id]
        );

        await client.query('COMMIT');
      } catch (initErr) {
        await client.query('ROLLBACK');
        console.error('Error initializing Google user records:', initErr);
      } finally {
        client.release();
      }
    }

    // Generate tokens
    const accessToken = generateAccessToken(user.id, user.email);
    const refreshToken = await generateRefreshToken(user.id);

    const displayName = user.raw_user_meta_data?.display_name || googlePayload.name || '';

    res.json({
      success: true,
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        display_name: displayName,
      },
    });
  } catch (err: any) {
    console.error('Google auth error:', err.message);
    res.status(401).json({ error: 'Google authentication failed' });
  }
});

// ─── POST /api/auth/update-user ────────────────────────────────────────────

router.post('/update-user', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'No authorization header' });
      return;
    }

    const token = authHeader.replace('Bearer ', '');
    let decoded: { userId: string; email: string };
    try {
      decoded = verifyAccessToken(token);
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const { password, user_metadata } = req.body;

    // Update password if provided
    if (password) {
      if (password.length < 8) {
        res.status(400).json({ error: 'Password must be at least 8 characters' });
        return;
      }

      const passwordHash = await hashPassword(password);
      await query(
        `UPDATE auth_users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
        [passwordHash, decoded.userId]
      );

      // Revoke all refresh tokens except current session (force re-login on other devices)
      await revokeAllUserTokens(decoded.userId);
    }

    // Update user metadata if provided
    if (user_metadata && typeof user_metadata === 'object') {
      await query(
        `UPDATE auth_users
         SET raw_user_meta_data = raw_user_meta_data || $1::jsonb, updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(user_metadata), decoded.userId]
      );

      // Also update user_profiles if display_name is being changed
      if (user_metadata.display_name !== undefined) {
        await query(
          `UPDATE user_profiles SET display_name = $1 WHERE id = $2`,
          [user_metadata.display_name, decoded.userId]
        );
      }
    }

    // Issue new tokens (password change invalidates old ones)
    const newAccessToken = generateAccessToken(decoded.userId, decoded.email);
    const newRefreshToken = await generateRefreshToken(decoded.userId);

    res.json({
      success: true,
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// ─── GET /api/auth/me ───────────────────────────────────────────────────────

router.get('/me', async (req: Request, res: Response): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.status(401).json({ error: 'No authorization header' });
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    let decoded: { userId: string; email: string };
    try {
      decoded = verifyAccessToken(token);
    } catch {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    const userResult = await query(
      `SELECT au.id, au.email, au.email_confirmed, au.provider, au.raw_user_meta_data, au.created_at, au.updated_at,
              up.display_name, up.full_name, up.bio, up.phone, up.avatar_url
       FROM auth_users au
       LEFT JOIN user_profiles up ON up.id = au.id
       WHERE au.id = $1`,
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const user = userResult.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        email_confirmed: user.email_confirmed,
        provider: user.provider,
        display_name: user.display_name || user.raw_user_meta_data?.display_name || '',
        full_name: user.full_name || user.raw_user_meta_data?.full_name || '',
        bio: user.bio || '',
        phone: user.phone || '',
        avatar_url: user.avatar_url || user.raw_user_meta_data?.avatar_url || '',
        created_at: user.created_at,
        updated_at: user.updated_at,
        last_sign_in_at: user.updated_at,
        email_confirmed_at: user.email_confirmed ? user.created_at : null,
      },
    });
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Failed to get user info' });
  }
});

export default router;
