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
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ============================================================================
// Email
// ============================================================================

async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<{ ok: boolean; reason: string }> {
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
    console.log(`[RESET-OTP] Mailjet ${resp.status}: ${respBody}`);

    if (!resp.ok) {
      return { ok: false, reason: `Mailjet HTTP ${resp.status}: ${respBody.substring(0, 300)}` };
    }

    try {
      const parsed = JSON.parse(respBody);
      const msg = parsed?.Messages?.[0];
      if (msg?.Status === "error") {
        return { ok: false, reason: `Mailjet message error: ${JSON.stringify(msg.Errors)}` };
      }
    } catch {
      // non-JSON but HTTP ok — treat as success
    }

    return { ok: true, reason: "sent" };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Fetch exception: ${message}` };
  }
}

function resetEmailHtml(otp: string, email: string): string {
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>@media(prefers-color-scheme:dark){.email-body{background:#1e293b !important}.email-card{background:#0f172a !important}.email-heading{color:#f1f5f9 !important}.email-text{color:#cbd5e1 !important}.email-footer{background:#1e293b !important}}</style>
</head>
<body class="email-body" style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;">
<span style="display:none;font-size:1px;color:#f8fafc;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">Your DocuIntelli AI password reset code is ${otp}</span>
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="560" cellpadding="0" cellspacing="0" class="email-card" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
<tr><td style="background:linear-gradient(135deg,#059669,#0d9488);padding:32px;text-align:center;">
<p style="font-size:24px;font-weight:700;color:#fff;margin:0;">DocuIntelli AI</p>
<p style="font-size:14px;color:rgba(255,255,255,0.85);margin:4px 0 0;">Password Reset</p>
</td></tr>
<tr><td style="padding:32px;">
<p class="email-heading" style="font-size:16px;color:#0f172a;font-weight:600;margin:0 0 8px;">Reset your password</p>
<p class="email-text" style="font-size:14px;color:#475569;margin:0 0 24px;line-height:1.6;">
We received a request to reset the password for your DocuIntelli AI account. Use the code below to verify your identity. This code expires in <strong>60 minutes</strong>.
</p>
<div style="text-align:center;padding:24px;background:#f0fdf4;border:2px dashed #059669;border-radius:12px;margin:0 0 24px;">
<p style="font-size:36px;font-weight:800;letter-spacing:8px;color:#059669;margin:0;font-family:monospace;">${otp}</p>
</div>
<p class="email-text" style="font-size:13px;color:#94a3b8;margin:0 0 16px;line-height:1.6;">
If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
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

// ============================================================================
// CORS Helper
// ============================================================================

function corsResponse(body: object | null, status = 200) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
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
    const { email } = await req.json();

    if (!email || !EMAIL_REGEX.test(email)) {
      return corsResponse({ error: "Please enter a valid email address" }, 400);
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log(`[RESET-OTP] Processing password reset for: ${normalizedEmail}`);

    // Use admin API to generate recovery link — this gives us the OTP code
    // without Supabase sending its own email
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
    });

    if (linkError) {
      console.error("[RESET-OTP] generateLink error:", linkError.message);
      // Don't reveal whether email exists — always return success
      return corsResponse({
        success: true,
        message: "If an account with this email exists, a reset code has been sent.",
      });
    }

    const otp = linkData?.properties?.email_otp;
    if (!otp) {
      console.error("[RESET-OTP] No email_otp in generateLink response");
      return corsResponse({ error: "Failed to generate reset code" }, 500);
    }

    console.log(`[RESET-OTP] OTP generated, sending email to: ${normalizedEmail}`);

    // Send OTP via Mailjet
    const emailResult = await sendEmail(
      normalizedEmail,
      `DocuIntelli AI — Your password reset code: ${otp}`,
      resetEmailHtml(otp, normalizedEmail),
    );

    if (!emailResult.ok) {
      console.error("[RESET-OTP] EMAIL DELIVERY FAILED:", emailResult.reason);
      return corsResponse({ error: `Email delivery failed: ${emailResult.reason}` }, 500);
    }

    console.log(`[RESET-OTP] SUCCESS — Reset OTP sent for: ${normalizedEmail}`);

    return corsResponse({
      success: true,
      message: "If an account with this email exists, a reset code has been sent.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[RESET-OTP] Unexpected error:", message);
    return corsResponse({ error: "An unexpected error occurred" }, 500);
  }
});
