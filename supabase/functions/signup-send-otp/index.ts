import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

// ============================================================================
// Configuration
// ============================================================================

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const FROM_NAME = "DocuIntelli AI";
const APP_URL = Deno.env.get("APP_URL") || "https://docuintelli.com";
const OTP_ENCRYPTION_KEY = Deno.env.get("OTP_ENCRYPTION_KEY") || "";
if (!OTP_ENCRYPTION_KEY || OTP_ENCRYPTION_KEY.length < 32) {
  console.error(
    "CRITICAL: OTP_ENCRYPTION_KEY is missing or too short. " +
    "Passwords will NOT be securely encrypted during signup. " +
    "Generate a key with: openssl rand -hex 32"
  );
}

const MAX_OTPS_PER_HOUR = 4; // 1 original + 3 resends
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

// ============================================================================
// Crypto Helpers
// ============================================================================

async function hashOTP(otp: string): Promise<string> {
  const encoded = new TextEncoder().encode(otp);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function encryptPassword(
  password: string,
): Promise<{ encrypted: string; iv: string }> {
  const keyBytes = hexToBytes(OTP_ENCRYPTION_KEY);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(password);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );

  return {
    encrypted: bytesToBase64(new Uint8Array(ciphertext)),
    iv: bytesToBase64(iv),
  };
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

// ============================================================================
// Email
// ============================================================================

async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; reason: string }> {
  // Read credentials at call-time (ensures secrets are available after cold start)
  const apiKey = Deno.env.get("SMTP_USER") || "";
  const secretKey = Deno.env.get("SMTP_PASS") || "";
  const fromEmail = Deno.env.get("FROM_EMAIL") || "noreply@docuintelli.com";

  if (!apiKey || !secretKey) {
    return { ok: false, reason: `Credentials missing: SMTP_USER=${!!apiKey}, SMTP_PASS=${!!secretKey}` };
  }

  try {
    const payload = {
      Messages: [
        {
          From: { Email: fromEmail, Name: FROM_NAME },
          To: [{ Email: to }],
          Subject: subject,
          HTMLPart: html,
        },
      ],
    };

    const resp = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Basic " + btoa(`${apiKey}:${secretKey}`),
      },
      body: JSON.stringify(payload),
    });

    const respBody = await resp.text();
    console.log(`[SEND-OTP] Mailjet ${resp.status}: ${respBody}`);

    if (!resp.ok) {
      return { ok: false, reason: `Mailjet HTTP ${resp.status}: ${respBody.substring(0, 300)}` };
    }

    // Check per-message status
    try {
      const parsed = JSON.parse(respBody);
      const msg = parsed?.Messages?.[0];
      if (msg?.Status === "error") {
        return { ok: false, reason: `Mailjet message error: ${JSON.stringify(msg.Errors)}` };
      }
    } catch {
      // non-JSON response but HTTP was ok — treat as success
    }

    return { ok: true, reason: "sent" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Fetch exception: ${message}` };
  }
}

function otpEmailHtml(otp: string, email: string): string {
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>@media(prefers-color-scheme:dark){.email-body{background:#1e293b !important}.email-card{background:#0f172a !important}.email-heading{color:#f1f5f9 !important}.email-text{color:#cbd5e1 !important}.email-footer{background:#1e293b !important}}</style>
</head>
<body class="email-body" style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;">
<span style="display:none;font-size:1px;color:#f8fafc;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Your DocuIntelli AI verification code is ${otp}</span>
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="560" cellpadding="0" cellspacing="0" class="email-card" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
<tr><td style="background:linear-gradient(135deg,#059669,#0d9488);padding:32px;text-align:center;">
<p style="font-size:24px;font-weight:700;color:#fff;margin:0;">DocuIntelli AI</p>
<p style="font-size:14px;color:rgba(255,255,255,0.85);margin:4px 0 0;">Email Verification</p>
</td></tr>
<tr><td style="padding:32px;">
<p class="email-heading" style="font-size:16px;color:#0f172a;font-weight:600;margin:0 0 8px;">Verify your email address</p>
<p class="email-text" style="font-size:14px;color:#475569;margin:0 0 24px;line-height:1.6;">
Use the code below to complete your DocuIntelli AI signup. This code expires in <strong>30 minutes</strong>.
</p>
<div style="text-align:center;padding:24px;background:#f0fdf4;border:2px dashed #059669;border-radius:12px;margin:0 0 24px;">
<p style="font-size:36px;font-weight:800;letter-spacing:8px;color:#059669;margin:0;font-family:monospace;">${otp}</p>
</div>
<p class="email-text" style="font-size:13px;color:#94a3b8;margin:0 0 16px;line-height:1.6;">
If you didn't request this code, you can safely ignore this email. Someone may have entered your email address by mistake.
</p>
<div style="border-top:1px solid #e2e8f0;padding-top:16px;margin-top:16px;">
<p style="font-size:12px;color:#cbd5e1;margin:0;">
This code was requested for <strong>${email}</strong>
</p>
</div>
</td></tr>
<tr><td class="email-footer" style="padding:16px 32px;background:#f8fafc;text-align:center;border-top:1px solid #e2e8f0;">
<p style="font-size:12px;color:#94a3b8;margin:0;">DocuIntelli AI &bull; <a href="${APP_URL}" style="color:#10b981;text-decoration:none;">Open App</a></p>
</td></tr>
</table></td></tr></table></body></html>`;
}

function existingAccountEmailHtml(email: string): string {
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
<tr><td style="background:linear-gradient(135deg,#059669,#0d9488);padding:32px;text-align:center;">
<p style="font-size:24px;font-weight:700;color:#fff;margin:0;">DocuIntelli AI</p>
<p style="font-size:14px;color:rgba(255,255,255,0.85);margin:4px 0 0;">Account Notice</p>
</td></tr>
<tr><td style="padding:32px;">
<p style="font-size:16px;color:#0f172a;font-weight:600;margin:0 0 8px;">Signup attempt for your email</p>
<p style="font-size:14px;color:#475569;margin:0 0 16px;line-height:1.6;">
Someone tried to create a new DocuIntelli AI account using <strong>${email}</strong>.
Since you already have an account, no new account was created.
</p>
<p style="font-size:14px;color:#475569;margin:0 0 24px;line-height:1.6;">
If this was you, please <a href="${APP_URL}" style="color:#059669;font-weight:600;">sign in to your existing account</a>.
If you forgot your password, use the "Forgot password?" option on the sign-in page.
</p>
<p style="font-size:13px;color:#94a3b8;margin:0;">
If you didn't request this, no action is needed. Your account is secure.
</p>
</td></tr>
<tr><td style="padding:16px 32px;background:#f8fafc;text-align:center;border-top:1px solid #e2e8f0;">
<p style="font-size:12px;color:#94a3b8;margin:0;">DocuIntelli AI &bull; <a href="${APP_URL}" style="color:#10b981;text-decoration:none;">Open App</a></p>
</td></tr></table></td></tr></table></body></html>`;
}

// ============================================================================
// CORS Helper
// ============================================================================

function corsResponse(body: object | null, status = 200) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "http://localhost:5173",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, X-Client-Info, Apikey",
  };

  if (status === 204) {
    return new Response(null, { status, headers });
  }

  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return corsResponse(null, 204);
  }

  if (req.method !== "POST") {
    return corsResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { email, password } = await req.json();

    // Validate inputs
    if (!email || !EMAIL_REGEX.test(email)) {
      return corsResponse({ error: "Please enter a valid email address" }, 400);
    }

    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return corsResponse(
        { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        400,
      );
    }

    if (!OTP_ENCRYPTION_KEY || OTP_ENCRYPTION_KEY.length !== 64) {
      console.error("[SEND-OTP] OTP_ENCRYPTION_KEY not configured or invalid length");
      return corsResponse({ error: "Server configuration error" }, 500);
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log(`[SEND-OTP] Processing signup for: ${normalizedEmail}`);

    // Rate limit: max 4 OTPs per email per hour (1 original + 3 resends)
    const { count, error: countError } = await supabase
      .from("signup_otps")
      .select("*", { count: "exact", head: true })
      .eq("email", normalizedEmail)
      .gte("created_at", new Date(Date.now() - 60 * 60 * 1000).toISOString());

    if (countError) {
      console.error("[SEND-OTP] Rate limit check failed:", countError.message);
      return corsResponse({ error: "Server error. Please try again." }, 500);
    }

    console.log(`[SEND-OTP] Rate limit count: ${count}`);

    if ((count ?? 0) >= MAX_OTPS_PER_HOUR) {
      return corsResponse(
        { error: "Too many requests. Please try again later." },
        429,
      );
    }

    // Check if email already exists in Supabase Auth via SQL function
    const { data: emailExists, error: rpcError } = await supabase
      .rpc("check_user_email_exists", { check_email: normalizedEmail });

    if (rpcError) {
      // Log the error but continue — assume email does NOT exist
      console.error("[SEND-OTP] RPC check_user_email_exists failed:", rpcError.message);
      console.error("[SEND-OTP] RPC error details:", JSON.stringify(rpcError));
    }

    console.log(`[SEND-OTP] emailExists RPC result: ${emailExists} (type: ${typeof emailExists})`);

    if (emailExists === true) {
      // Send notification to existing user (don't reveal to the requester)
      console.log(
        `[SEND-OTP] Email already registered: ${normalizedEmail}, sending notice`,
      );
      const noticeResult = await sendEmail(
        normalizedEmail,
        "DocuIntelli AI — Signup Attempt Notice",
        existingAccountEmailHtml(normalizedEmail),
      );
      console.log(`[SEND-OTP] Notice email result: ${noticeResult.reason}`);
      // Return same success response to prevent email enumeration
      return corsResponse({
        success: true,
        message: "If this email is not already registered, a verification code has been sent.",
      });
    }

    console.log(`[SEND-OTP] Email not registered, generating OTP...`);

    // Generate 6-digit OTP
    const otpNum =
      (crypto.getRandomValues(new Uint32Array(1))[0] % 900000) + 100000;
    const otp = String(otpNum);

    // Hash OTP
    const otpHash = await hashOTP(otp);

    // Encrypt password
    const { encrypted, iv } = await encryptPassword(password);

    // Invalidate all previous OTPs for this email
    const { error: invalidateError } = await supabase
      .from("signup_otps")
      .update({ is_used: true, updated_at: new Date().toISOString() })
      .eq("email", normalizedEmail)
      .eq("is_used", false);

    if (invalidateError) {
      console.warn("[SEND-OTP] Invalidate old OTPs warning:", invalidateError.message);
    }

    // Insert new OTP record
    const { error: insertError } = await supabase
      .from("signup_otps")
      .insert({
        email: normalizedEmail,
        otp_hash: otpHash,
        password_encrypted: encrypted,
        password_iv: iv,
        attempts: 0,
        is_used: false,
      });

    if (insertError) {
      console.error("[SEND-OTP] Insert failed:", insertError.message);
      return corsResponse({ error: "Failed to generate verification code" }, 500);
    }

    console.log(`[SEND-OTP] OTP record inserted, sending email...`);

    // Send OTP email
    const emailResult = await sendEmail(
      normalizedEmail,
      `DocuIntelli AI — Your verification code: ${otp}`,
      otpEmailHtml(otp, normalizedEmail),
    );

    if (!emailResult.ok) {
      console.error("[SEND-OTP] EMAIL DELIVERY FAILED:", emailResult.reason);
      return corsResponse(
        { error: `Email delivery failed: ${emailResult.reason}` },
        500,
      );
    }

    console.log(`[SEND-OTP] SUCCESS — OTP generated and email sent for: ${normalizedEmail}`);

    return corsResponse({
      success: true,
      message: "If this email is not already registered, a verification code has been sent.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[SEND-OTP] Unexpected error:", message);
    return corsResponse({ error: "An unexpected error occurred" }, 500);
  }
});
