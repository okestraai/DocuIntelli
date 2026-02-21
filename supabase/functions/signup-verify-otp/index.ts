import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

// ============================================================================
// Configuration
// ============================================================================

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const OTP_ENCRYPTION_KEY = Deno.env.get("OTP_ENCRYPTION_KEY") || "";
if (!OTP_ENCRYPTION_KEY || OTP_ENCRYPTION_KEY.length < 32) {
  console.error(
    "CRITICAL: OTP_ENCRYPTION_KEY is missing or too short. " +
    "Password decryption will fail. " +
    "Generate a key with: openssl rand -hex 32"
  );
}
const MAX_ATTEMPTS = 5;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

async function decryptPassword(
  encrypted: string,
  ivBase64: string,
): Promise<string> {
  const keyBytes = hexToBytes(OTP_ENCRYPTION_KEY);
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  const iv = base64ToBytes(ivBase64);
  const ciphertext = base64ToBytes(encrypted);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Constant-time string comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
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
    const { email, otp } = await req.json();

    // Validate inputs
    if (!email || !EMAIL_REGEX.test(email)) {
      return corsResponse({ error: "Please enter a valid email address" }, 400);
    }

    if (!otp || !/^\d{6}$/.test(otp)) {
      return corsResponse({ error: "Please enter a valid 6-digit code" }, 400);
    }

    if (!OTP_ENCRYPTION_KEY || OTP_ENCRYPTION_KEY.length !== 64) {
      console.error("[VERIFY-OTP] OTP_ENCRYPTION_KEY not configured");
      return corsResponse({ error: "Server configuration error" }, 500);
    }

    const normalizedEmail = email.trim().toLowerCase();
    console.log(`[VERIFY-OTP] Verifying OTP for: ${normalizedEmail}`);

    // Find the most recent active OTP for this email
    const { data: otpRecord, error: fetchError } = await supabase
      .from("signup_otps")
      .select("*")
      .eq("email", normalizedEmail)
      .eq("is_used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error("[VERIFY-OTP] Fetch error:", fetchError.message);
      return corsResponse({ error: "Server error. Please try again." }, 500);
    }

    if (!otpRecord) {
      console.log(`[VERIFY-OTP] No active OTP found for: ${normalizedEmail}`);
      return corsResponse(
        { error: "Invalid or expired verification code. Please request a new one." },
        400,
      );
    }

    console.log(`[VERIFY-OTP] Found OTP record id: ${otpRecord.id}, attempts: ${otpRecord.attempts}, expires: ${otpRecord.expires_at}`);

    // Check attempt limit
    if (otpRecord.attempts >= MAX_ATTEMPTS) {
      // Invalidate this OTP
      await supabase
        .from("signup_otps")
        .update({ is_used: true, updated_at: new Date().toISOString() })
        .eq("id", otpRecord.id);

      return corsResponse(
        { error: "Too many failed attempts. Please request a new code." },
        400,
      );
    }

    // Hash the submitted OTP and compare
    const submittedHash = await hashOTP(otp);
    const isMatch = timingSafeEqual(submittedHash, otpRecord.otp_hash);

    if (!isMatch) {
      // Increment attempt counter
      const newAttempts = otpRecord.attempts + 1;
      await supabase
        .from("signup_otps")
        .update({ attempts: newAttempts, updated_at: new Date().toISOString() })
        .eq("id", otpRecord.id);

      const remaining = MAX_ATTEMPTS - newAttempts;
      if (remaining <= 0) {
        // Also invalidate on reaching max
        await supabase
          .from("signup_otps")
          .update({ is_used: true, updated_at: new Date().toISOString() })
          .eq("id", otpRecord.id);

        return corsResponse(
          { error: "Too many failed attempts. Please request a new code." },
          400,
        );
      }

      return corsResponse(
        {
          error: `Invalid verification code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
        },
        400,
      );
    }

    // OTP is valid — decrypt the password first, create user, THEN mark as used
    // (so if createUser fails, the user can retry without a new OTP)

    // Decrypt the password
    let decryptedPassword: string;
    try {
      decryptedPassword = await decryptPassword(
        otpRecord.password_encrypted,
        otpRecord.password_iv,
      );
      console.log(`[VERIFY-OTP] Password decrypted successfully (length: ${decryptedPassword.length})`);
    } catch (decryptErr) {
      console.error("[VERIFY-OTP] Password decryption failed:", decryptErr);
      // Mark OTP as used since decryption is a permanent failure
      await supabase
        .from("signup_otps")
        .update({ is_used: true, updated_at: new Date().toISOString() })
        .eq("id", otpRecord.id);
      return corsResponse(
        { error: "Verification failed. Please request a new code and try again." },
        500,
      );
    }

    // Create the user account in Supabase Auth
    console.log(`[VERIFY-OTP] Creating user: ${normalizedEmail}`);
    const { data: newUser, error: createError } =
      await supabase.auth.admin.createUser({
        email: normalizedEmail,
        password: decryptedPassword,
        email_confirm: true,
      });

    if (createError) {
      console.error("[VERIFY-OTP] User creation failed:", createError.message);

      // If user already exists, mark OTP as used (permanent failure)
      if (
        createError.message.includes("already been registered") ||
        createError.message.includes("already exists")
      ) {
        await supabase
          .from("signup_otps")
          .update({ is_used: true, updated_at: new Date().toISOString() })
          .eq("id", otpRecord.id);
        return corsResponse(
          { error: "An account with this email already exists. Please sign in instead." },
          409,
        );
      }

      // For other errors, DON'T mark OTP as used — user can retry
      return corsResponse(
        { error: `Account creation failed: ${createError.message}` },
        500,
      );
    }

    // Success — now mark OTP as used
    await supabase
      .from("signup_otps")
      .update({ is_used: true, updated_at: new Date().toISOString() })
      .eq("id", otpRecord.id);

    console.log(
      `[VERIFY-OTP] User created: ${newUser.user.id} (${normalizedEmail})`,
    );

    // Generate a magic link token for auto-login
    const { data: linkData, error: linkError } =
      await supabase.auth.admin.generateLink({
        type: "magiclink",
        email: normalizedEmail,
      });

    if (linkError || !linkData?.properties?.hashed_token) {
      console.error("[VERIFY-OTP] Magic link generation failed:", linkError?.message);
      // User was created successfully, they can still sign in manually
      return corsResponse({
        success: true,
        token_hash: null,
        message: "Email verified and account created! Please sign in.",
      });
    }

    console.log(`[VERIFY-OTP] Auto-login token generated for: ${normalizedEmail}`);

    return corsResponse({
      success: true,
      token_hash: linkData.properties.hashed_token,
      message: "Email verified successfully!",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[VERIFY-OTP] Unexpected error:", message);
    return corsResponse({ error: "An unexpected error occurred" }, 500);
  }
});
