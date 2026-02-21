import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

// ============================================================================
// Configuration
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") || "http://localhost:5173",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Mailjet REST API for email (same credentials as SMTP)
const MAILJET_API_KEY = Deno.env.get("SMTP_USER") || "";
const MAILJET_SECRET_KEY = Deno.env.get("SMTP_PASS") || "";
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "noreply@docuintelli.com";
const FROM_NAME = "DocuIntelli AI";
const APP_URL = Deno.env.get("APP_URL") || "https://docuintelli.com";

const DOC_SELECT =
  "id, user_id, name, category, type, tags, expiration_date, upload_date, last_reviewed_at, review_cadence_days, issuer, owner_name, effective_date, status, processed, health_state, health_computed_at";

type TaskName =
  | "expiration-notifications"
  | "weekly-audit-email"
  | "preparedness-snapshots"
  | "stripe-billing-sync"
  | "life-event-readiness"
  | "review-cadence-reminders"
  | "stuck-docs-processing"
  | "warmup-chat"
  | "dunning-escalation";

// ============================================================================
// Main Handler
// ============================================================================

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { task } = (await req.json()) as { task: TaskName };
    console.log(`[CRON] Task started: ${task} at ${new Date().toISOString()}`);

    let result: Record<string, unknown>;

    switch (task) {
      case "expiration-notifications":
        result = await runExpirationNotifications();
        break;
      case "weekly-audit-email":
        result = await runWeeklyAuditEmail();
        break;
      case "preparedness-snapshots":
        result = await runPreparednessSnapshots();
        break;
      case "stripe-billing-sync":
        result = await runStripeBillingSync();
        break;
      case "life-event-readiness":
        result = await runLifeEventReadiness();
        break;
      case "review-cadence-reminders":
        result = await runReviewCadenceReminders();
        break;
      case "stuck-docs-processing":
        result = await runStuckDocsProcessing();
        break;
      case "warmup-chat": {
        // Ping chat-document edge function to prevent cold starts
        const warmupRes = await fetch(`${supabaseUrl}/functions/v1/chat-document`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ warmup: true }),
        });
        result = { pinged: warmupRes.ok, status: warmupRes.status };
        break;
      }
      case "dunning-escalation": {
        // Call the Express dunning endpoint which handles Stripe retries + escalation
        const appUrl = Deno.env.get("APP_URL") || "http://localhost:5000";
        const dunningRes = await fetch(`${appUrl}/api/dunning/run`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${supabaseServiceKey}`,
          },
        });
        const dunningBody = await dunningRes.json();
        result = { status: dunningRes.status, ...dunningBody };
        break;
      }
      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown task: ${task}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
    }

    console.log(`[CRON] Task completed: ${task}`, result);
    return new Response(JSON.stringify({ success: true, task, ...result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[CRON] Task failed:", message);
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ============================================================================
// Email Sending via Mailjet REST API v3.1
// ============================================================================

async function sendEmail(
  to: string,
  subject: string,
  html: string,
): Promise<boolean> {
  if (!MAILJET_API_KEY || !MAILJET_SECRET_KEY) {
    console.warn("[EMAIL] Mailjet not configured, skipping");
    return false;
  }

  try {
    const resp = await fetch("https://api.mailjet.com/v3.1/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization:
          "Basic " + btoa(`${MAILJET_API_KEY}:${MAILJET_SECRET_KEY}`),
      },
      body: JSON.stringify({
        Messages: [
          {
            From: { Email: FROM_EMAIL, Name: FROM_NAME },
            To: [{ Email: to }],
            Subject: subject,
            HTMLPart: html,
          },
        ],
      }),
    });

    if (!resp.ok) {
      const err = await resp.text();
      console.error(`[EMAIL] Mailjet error for ${to}:`, err);
      return false;
    }
    return true;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[EMAIL] Send failed for ${to}:`, message);
    return false;
  }
}

/** Check if a user has a notification category enabled. */
async function isNotificationEnabled(
  userId: string,
  category: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("user_subscriptions")
    .select(category)
    .eq("user_id", userId)
    .single();

  // Default to true if column doesn't exist or is null
  return data?.[category] ?? true;
}

/** Get user email from auth. */
async function getUserEmail(userId: string): Promise<string | null> {
  const { data } = await supabase.auth.admin.getUserById(userId);
  return data?.user?.email || null;
}

/** Get user display name. */
async function getUserName(userId: string): Promise<string> {
  const { data } = await supabase
    .from("user_subscriptions")
    .select("display_name")
    .eq("user_id", userId)
    .single();
  return (data as Record<string, string>)?.display_name || "";
}

/** Log a notification to the audit table. */
async function logNotification(
  userId: string,
  type: string,
  email: string,
  success: boolean,
): Promise<void> {
  await supabase.from("notification_logs").insert({
    user_id: userId,
    notification_type: `cron:${type}`,
    channel: "email",
    recipient: email,
    status: success ? "sent" : "failed",
    sent_at: new Date().toISOString(),
  });
}

// ============================================================================
// Health Computation (ported from engagementEngine.ts — pure functions)
// ============================================================================

type HealthState = "healthy" | "watch" | "risk" | "critical";

interface DocRow {
  id: string;
  user_id: string;
  name: string;
  category: string;
  tags: string[] | null;
  expiration_date: string | null;
  upload_date: string;
  last_reviewed_at: string | null;
  review_cadence_days: number | null;
  issuer: string | null;
  owner_name: string | null;
}

function computeHealth(doc: DocRow, now: Date): { state: HealthState; score: number } {
  let score = 100;

  if (doc.expiration_date) {
    const days = Math.ceil(
      (new Date(doc.expiration_date).getTime() - now.getTime()) / 86400000,
    );
    if (days < 0) score -= 50;
    else if (days <= 7) score -= 40;
    else if (days <= 30) score -= 25;
    else if (days <= 90) score -= 10;
  }

  if (doc.review_cadence_days) {
    const last = doc.last_reviewed_at
      ? new Date(doc.last_reviewed_at)
      : new Date(doc.upload_date);
    const overdue =
      Math.ceil((now.getTime() - last.getTime()) / 86400000) -
      doc.review_cadence_days;
    if (overdue > 60) score -= 30;
    else if (overdue > 0) score -= 15;
    else if (doc.review_cadence_days - Math.ceil((now.getTime() - last.getTime()) / 86400000) <= 14) score -= 5;
  } else if (!doc.expiration_date) {
    const lastAction = doc.last_reviewed_at
      ? new Date(doc.last_reviewed_at)
      : new Date(doc.upload_date);
    const daysSince = Math.ceil(
      (now.getTime() - lastAction.getTime()) / 86400000,
    );
    if (daysSince > 365) score -= 20;
    else if (daysSince > 180) score -= 10;
  }

  const missing = [
    !doc.tags || doc.tags.length === 0,
    !doc.expiration_date && !doc.review_cadence_days,
    !doc.issuer,
    !doc.owner_name,
  ].filter(Boolean).length;
  if (missing >= 3) score -= 15;
  else score -= 5 * missing;

  score = Math.max(0, Math.min(100, score));
  const state: HealthState =
    score >= 75 ? "healthy" : score >= 50 ? "watch" : score >= 25 ? "risk" : "critical";

  return { state, score };
}

function computePreparedness(
  docs: DocRow[],
  now: Date,
): { score: number } {
  if (docs.length === 0) return { score: 0 };
  const t = docs.length;

  const withExp = docs.filter((d) => d.expiration_date).length;
  const withTags = docs.filter((d) => d.tags && d.tags.length > 0).length;
  const withCat = docs.filter(
    (d) => d.category && d.category !== "other",
  ).length;
  const withIssuer = docs.filter((d) => d.issuer).length;
  const metaScore =
    ((withExp / t) * 0.35 +
      (withTags / t) * 0.25 +
      (withCat / t) * 0.2 +
      (withIssuer / t) * 0.2) *
    25;

  const expScore = (withExp / t) * 25;

  const sixMo = new Date(now.getTime() - 180 * 86400000);
  const reviewed = docs.filter((d) => {
    const dt = d.last_reviewed_at
      ? new Date(d.last_reviewed_at)
      : new Date(d.upload_date);
    return dt >= sixMo;
  }).length;
  const reviewScore = (reviewed / t) * 25;

  let healthy = 0;
  let watch = 0;
  for (const d of docs) {
    const h = computeHealth(d, now);
    if (h.state === "healthy") healthy++;
    else if (h.state === "watch") watch++;
  }
  const healthScore = (healthy / t) * 25 + (watch / t) * 15;

  return {
    score: Math.round(
      Math.max(0, Math.min(100, metaScore + expScore + reviewScore + healthScore)),
    ),
  };
}

// ============================================================================
// Minimal HTML email wrapper
// ============================================================================

function emailWrap(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px;">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">
<tr><td style="padding:32px 32px 0;text-align:center;">
<p style="font-size:24px;font-weight:700;color:#0f172a;margin:0 0 8px;">${title}</p>
</td></tr>
<tr><td style="padding:16px 32px 32px;">${body}</td></tr>
<tr><td style="padding:16px 32px;background:#f8fafc;text-align:center;border-top:1px solid #e2e8f0;">
<p style="font-size:12px;color:#94a3b8;margin:0;">DocuIntelli AI &bull; <a href="${APP_URL}" style="color:#10b981;">Open App</a></p>
</td></tr></table></td></tr></table></body></html>`;
}

// ============================================================================
// Helpers
// ============================================================================

async function getActiveUserIds(): Promise<string[]> {
  const { data } = await supabase
    .from("documents")
    .select("user_id")
    .limit(10000);
  if (!data) return [];
  return [...new Set(data.map((d: Record<string, string>) => d.user_id))];
}

async function fetchUserDocs(userId: string): Promise<DocRow[]> {
  const { data } = await supabase
    .from("documents")
    .select(DOC_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data || []) as DocRow[];
}

// ============================================================================
// Task 1: Expiration Notifications — Daily 08:00 UTC
// ============================================================================

async function runExpirationNotifications(): Promise<Record<string, unknown>> {
  const now = new Date();
  const today = now.toISOString().split("T")[0];
  const cutoff = new Date(now.getTime() + 30 * 86400000)
    .toISOString()
    .split("T")[0];

  const { data: docs } = await supabase
    .from("documents")
    .select("id, user_id, name, category, expiration_date")
    .gte("expiration_date", today)
    .lte("expiration_date", cutoff);

  if (!docs || docs.length === 0) return { sent: 0, docs: 0 };

  // Group by user
  const byUser = new Map<string, typeof docs>();
  for (const d of docs) {
    const list = byUser.get(d.user_id) || [];
    list.push(d);
    byUser.set(d.user_id, list);
  }

  let sent = 0;
  for (const [userId, userDocs] of byUser) {
    // Skip if already notified today
    const { data: recent } = await supabase
      .from("notification_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("notification_type", "cron:expiration-notifications")
      .gte("sent_at", `${today}T00:00:00Z`)
      .limit(1)
      .maybeSingle();
    if (recent) continue;

    if (!(await isNotificationEnabled(userId, "document_alerts"))) continue;

    const email = await getUserEmail(userId);
    if (!email) continue;
    const name = await getUserName(userId);
    const firstName = name?.split(" ")[0] || "there";

    const sorted = userDocs.sort(
      (a: Record<string, string>, b: Record<string, string>) =>
        new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime(),
    );
    const top = sorted.slice(0, 5);

    const rows = top
      .map((d: Record<string, string>) => {
        const days = Math.ceil(
          (new Date(d.expiration_date).getTime() - now.getTime()) / 86400000,
        );
        const color = days <= 7 ? "#ef4444" : days <= 14 ? "#f59e0b" : "#64748b";
        const label = days <= 0 ? "Expired" : days === 1 ? "Tomorrow" : `${days} days`;
        return `<tr><td style="padding:10px 0;border-bottom:1px solid #e2e8f0;"><strong>${d.name}</strong><br><span style="font-size:12px;color:#64748b;">${d.category} &bull; ${d.expiration_date}</span></td><td style="text-align:right;padding:10px 0;border-bottom:1px solid #e2e8f0;"><span style="padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600;color:#fff;background:${color};">${label}</span></td></tr>`;
      })
      .join("");

    const body = `<p style="color:#475569;font-size:14px;">Hi ${firstName}, ${userDocs.length} document${userDocs.length > 1 ? "s" : ""} need${userDocs.length === 1 ? "s" : ""} your attention.</p>
<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<div style="text-align:center;margin:24px 0;"><a href="${APP_URL}" style="display:inline-block;padding:12px 28px;background:#10b981;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Review in Vault</a></div>`;

    const ok = await sendEmail(
      email,
      `DocuIntelli — ${userDocs.length} document${userDocs.length > 1 ? "s" : ""} expiring soon`,
      emailWrap("Documents Expiring Soon", body),
    );
    await logNotification(userId, "expiration-notifications", email, ok);
    if (ok) sent++;
  }

  return { sent, totalDocs: docs.length, users: byUser.size };
}

// ============================================================================
// Task 2: Weekly Audit Email — Sunday 22:00 UTC
// ============================================================================

async function runWeeklyAuditEmail(): Promise<Record<string, unknown>> {
  const userIds = await getActiveUserIds();
  const now = new Date();
  let sent = 0;

  for (const userId of userIds) {
    if (!(await isNotificationEnabled(userId, "engagement_digests"))) continue;

    const email = await getUserEmail(userId);
    if (!email) continue;
    const name = await getUserName(userId);
    const firstName = name?.split(" ")[0] || "there";

    const docs = await fetchUserDocs(userId);
    if (docs.length === 0) continue;

    const prep = computePreparedness(docs, now);
    const thirtyDays = new Date(now.getTime() + 30 * 86400000);

    let healthy = 0, watch = 0, risk = 0, critical = 0;
    for (const d of docs) {
      const h = computeHealth(d, now);
      if (h.state === "healthy") healthy++;
      else if (h.state === "watch") watch++;
      else if (h.state === "risk") risk++;
      else critical++;
    }

    const expiring = docs.filter((d) => {
      if (!d.expiration_date) return false;
      const exp = new Date(d.expiration_date);
      return exp <= thirtyDays && exp >= now;
    });

    const incomplete = docs.filter((d) => {
      const missing = [
        !d.tags || d.tags.length === 0,
        !d.issuer,
        !d.owner_name,
        !d.expiration_date && !d.review_cadence_days,
      ].filter(Boolean).length;
      return missing >= 2;
    });

    const scoreColor = prep.score >= 80 ? "#10b981" : prep.score >= 50 ? "#f59e0b" : "#ef4444";

    const body = `<p style="color:#475569;font-size:14px;">Hi ${firstName}, here's your weekly vault summary.</p>
<div style="text-align:center;padding:20px;background:${scoreColor}0a;border-radius:12px;margin:16px 0;">
<p style="font-size:48px;font-weight:800;color:${scoreColor};margin:0;">${prep.score}</p>
<p style="font-size:13px;color:#64748b;margin:4px 0 0;">Preparedness Score</p></div>
<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;text-align:center;">
<tr><td style="padding:8px;"><p style="font-size:20px;font-weight:700;color:#10b981;margin:0;">${healthy}</p><p style="font-size:11px;color:#94a3b8;margin:2px 0 0;">Healthy</p></td>
<td style="padding:8px;"><p style="font-size:20px;font-weight:700;color:#3b82f6;margin:0;">${watch}</p><p style="font-size:11px;color:#94a3b8;margin:2px 0 0;">Watch</p></td>
<td style="padding:8px;"><p style="font-size:20px;font-weight:700;color:#f59e0b;margin:0;">${risk}</p><p style="font-size:11px;color:#94a3b8;margin:2px 0 0;">Risk</p></td>
<td style="padding:8px;"><p style="font-size:20px;font-weight:700;color:#ef4444;margin:0;">${critical}</p><p style="font-size:11px;color:#94a3b8;margin:2px 0 0;">Critical</p></td></tr></table>
${expiring.length > 0 ? `<p style="font-size:14px;font-weight:600;color:#0f172a;margin:16px 0 8px;">Expiring Soon (${expiring.length})</p><ul style="margin:0;padding-left:20px;font-size:13px;color:#64748b;">${expiring.slice(0, 5).map((d) => `<li>${d.name} — ${d.expiration_date}</li>`).join("")}</ul>` : ""}
${incomplete.length > 0 ? `<p style="font-size:13px;color:#f59e0b;margin:12px 0;"><strong>${incomplete.length}</strong> document${incomplete.length > 1 ? "s" : ""} with incomplete metadata</p>` : ""}
<div style="text-align:center;margin:24px 0;"><a href="${APP_URL}" style="display:inline-block;padding:12px 28px;background:#10b981;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">View Full Audit</a></div>`;

    const ok = await sendEmail(
      email,
      `DocuIntelli — Weekly Audit: Score ${prep.score}/100`,
      emailWrap("Your Weekly Vault Audit", body),
    );
    await logNotification(userId, "weekly-audit-email", email, ok);
    if (ok) sent++;
  }

  return { sent, totalUsers: userIds.length };
}

// ============================================================================
// Task 3: Preparedness Snapshots — Daily 00:30 UTC
// ============================================================================

async function runPreparednessSnapshots(): Promise<Record<string, unknown>> {
  const userIds = await getActiveUserIds();
  const today = new Date().toISOString().split("T")[0];
  const now = new Date();
  let saved = 0;

  for (const userId of userIds) {
    const docs = await fetchUserDocs(userId);
    if (docs.length === 0) continue;

    const prep = computePreparedness(docs, now);

    let healthy = 0, watch = 0, risk = 0, critical = 0;
    for (const d of docs) {
      const h = computeHealth(d, now);
      if (h.state === "healthy") healthy++;
      else if (h.state === "watch") watch++;
      else if (h.state === "risk") risk++;
      else critical++;
    }

    await supabase.from("preparedness_snapshots").upsert(
      {
        user_id: userId,
        score: prep.score,
        factors: {
          details: {
            totalDocs: docs.length,
            docsHealthy: healthy,
            docsWatch: watch,
            docsRisk: risk,
            docsCritical: critical,
          },
        },
        snapshot_date: today,
      },
      { onConflict: "user_id,snapshot_date" },
    );
    saved++;
  }

  return { saved, totalUsers: userIds.length };
}

// ============================================================================
// Task 4: Stripe Billing Reconciliation — Daily 05:00 UTC
// ============================================================================

async function runStripeBillingSync(): Promise<Record<string, unknown>> {
  const { data: subs } = await supabase
    .from("user_subscriptions")
    .select("user_id, stripe_customer_id")
    .not("stripe_customer_id", "is", null);

  if (!subs || subs.length === 0) return { synced: 0 };

  let synced = 0;
  for (const sub of subs) {
    try {
      const resp = await fetch(
        `${supabaseUrl}/functions/v1/stripe-sync-billing`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            customer_id: sub.stripe_customer_id,
            user_id: sub.user_id,
          }),
        },
      );
      if (resp.ok) synced++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[stripe-sync] ${sub.stripe_customer_id}: ${message}`);
    }
  }

  return { synced, total: subs.length };
}

// ============================================================================
// Task 5: Life Event Readiness Refresh — Daily 03:00 UTC
// ============================================================================

async function runLifeEventReadiness(): Promise<Record<string, unknown>> {
  const { data: events } = await supabase
    .from("life_events")
    .select("id, user_id")
    .eq("status", "active");

  if (!events || events.length === 0) return { refreshed: 0 };

  let refreshed = 0;
  for (const event of events) {
    try {
      // Call the life event readiness recompute logic by fetching existing requirements
      // and re-matching documents. This mimics what the /recompute endpoint does.
      const { data: reqs } = await supabase
        .from("life_event_requirement_status")
        .select("requirement_id, status, matched_documents")
        .eq("life_event_id", event.id);

      if (!reqs) continue;

      // Get user docs for matching
      const { data: userDocs } = await supabase
        .from("documents")
        .select("id, name, category, tags, expiration_date")
        .eq("user_id", event.user_id);

      if (!userDocs) continue;

      // Check if any matched documents have expired since last check
      const now = new Date();
      let updated = false;
      for (const req of reqs) {
        if (req.status === "satisfied" && req.matched_documents) {
          for (const match of req.matched_documents as Array<Record<string, string>>) {
            const doc = userDocs.find((d: Record<string, string>) => d.id === match.documentId);
            if (doc?.expiration_date && new Date(doc.expiration_date) < now) {
              // Document expired — mark requirement as needs_update
              await supabase
                .from("life_event_requirement_status")
                .update({ status: "needs_update", updated_at: now.toISOString() })
                .eq("life_event_id", event.id)
                .eq("requirement_id", req.requirement_id);
              updated = true;
            }
          }
        }
      }

      // Recompute readiness score
      const { data: allReqs } = await supabase
        .from("life_event_requirement_status")
        .select("status")
        .eq("life_event_id", event.id)
        .neq("status", "not_applicable");

      if (allReqs && allReqs.length > 0) {
        const satisfied = allReqs.filter(
          (r: Record<string, string>) => r.status === "satisfied",
        ).length;
        const expiringSoon = allReqs.filter(
          (r: Record<string, string>) => r.status === "expiring_soon",
        ).length;
        const score = Math.round(
          ((satisfied + expiringSoon * 0.75) / allReqs.length) * 100,
        );

        await supabase
          .from("life_events")
          .update({ readiness_score: score, updated_at: now.toISOString() })
          .eq("id", event.id);
      }

      refreshed++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[life-events] ${event.id}: ${message}`);
    }
  }

  return { refreshed, total: events.length };
}

// ============================================================================
// Task 6: Review Cadence Reminders — Monday 09:00 UTC
// ============================================================================

async function runReviewCadenceReminders(): Promise<Record<string, unknown>> {
  const now = new Date();

  const { data: docs } = await supabase
    .from("documents")
    .select("id, user_id, name, category, last_reviewed_at, upload_date, review_cadence_days")
    .not("review_cadence_days", "is", null);

  if (!docs || docs.length === 0) return { sent: 0 };

  // Find overdue
  const overdue = docs.filter((d: Record<string, unknown>) => {
    const last = d.last_reviewed_at
      ? new Date(d.last_reviewed_at as string)
      : new Date(d.upload_date as string);
    const next = new Date(
      last.getTime() + (d.review_cadence_days as number) * 86400000,
    );
    return next <= now;
  });

  if (overdue.length === 0) return { sent: 0, overdue: 0 };

  // Group by user
  const byUser = new Map<string, typeof overdue>();
  for (const d of overdue) {
    const list = byUser.get(d.user_id as string) || [];
    list.push(d);
    byUser.set(d.user_id as string, list);
  }

  let sent = 0;
  const weekAgo = new Date(now.getTime() - 7 * 86400000);

  for (const [userId, userDocs] of byUser) {
    // Deduplicate: 1 email per user per week
    const { data: recent } = await supabase
      .from("notification_logs")
      .select("id")
      .eq("user_id", userId)
      .eq("notification_type", "cron:review-cadence-reminders")
      .gte("sent_at", weekAgo.toISOString())
      .limit(1)
      .maybeSingle();
    if (recent) continue;

    if (!(await isNotificationEnabled(userId, "document_alerts"))) continue;

    const email = await getUserEmail(userId);
    if (!email) continue;
    const name = await getUserName(userId);
    const firstName = name?.split(" ")[0] || "there";

    const rows = userDocs
      .slice(0, 5)
      .map((d: Record<string, unknown>) => {
        const last = d.last_reviewed_at
          ? new Date(d.last_reviewed_at as string)
          : new Date(d.upload_date as string);
        const days = Math.ceil((now.getTime() - last.getTime()) / 86400000);
        return `<li style="margin:4px 0;">${d.name} <span style="color:#ef4444;font-weight:600;">(${days}d overdue)</span></li>`;
      })
      .join("");

    const body = `<p style="color:#475569;font-size:14px;">Hi ${firstName}, ${userDocs.length} document${userDocs.length > 1 ? "s are" : " is"} overdue for review.</p>
<ul style="margin:12px 0;padding-left:20px;font-size:14px;color:#334155;line-height:1.8;">${rows}</ul>
${userDocs.length > 5 ? `<p style="font-size:13px;color:#94a3b8;">...and ${userDocs.length - 5} more</p>` : ""}
<div style="text-align:center;margin:24px 0;"><a href="${APP_URL}" style="display:inline-block;padding:12px 28px;background:#10b981;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Review Documents</a></div>`;

    const ok = await sendEmail(
      email,
      `DocuIntelli — ${userDocs.length} document${userDocs.length > 1 ? "s" : ""} overdue for review`,
      emailWrap("Review Reminders", body),
    );
    await logNotification(userId, "review-cadence-reminders", email, ok);
    if (ok) sent++;
  }

  return { sent, overdue: overdue.length, users: byUser.size };
}

// ============================================================================
// Task 7: Stuck Docs Processing — Every 30 minutes
// ============================================================================

async function runStuckDocsProcessing(): Promise<Record<string, unknown>> {
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  // --- Phase 1: Fix stuck unprocessed documents ---

  const { data: stuck } = await supabase
    .from("documents")
    .select("id, name")
    .eq("processed", false)
    .lt("created_at", tenMinAgo)
    .limit(10);

  let processed = 0;
  if (stuck && stuck.length > 0) {
    for (const doc of stuck) {
      const { count } = await supabase
        .from("document_chunks")
        .select("id", { count: "exact", head: true })
        .eq("document_id", doc.id)
        .is("embedding", null);

      if (count && count > 0) {
        try {
          const resp = await fetch(
            `${supabaseUrl}/functions/v1/generate-embeddings`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${supabaseServiceKey}`,
              },
              body: JSON.stringify({
                document_id: doc.id,
                continue_processing: true,
              }),
            },
          );
          if (resp.ok) processed++;
        } catch {
          console.error(`[stuck-docs] Failed to trigger embeddings for ${doc.id}`);
        }
      } else {
        await supabase
          .from("documents")
          .update({ processed: true })
          .eq("id", doc.id);
        processed++;
      }
    }
  }

  // --- Phase 2: Generate tags for documents with ≥60% embeddings but no tags ---

  const { data: untagged } = await supabase
    .from("documents")
    .select("id, name")
    .or("tags.is.null,tags.eq.{}")
    .limit(20);

  let tagged = 0;
  if (untagged && untagged.length > 0) {
    for (const doc of untagged) {
      // Count total chunks and chunks with embeddings
      const { count: totalChunks } = await supabase
        .from("document_chunks")
        .select("id", { count: "exact", head: true })
        .eq("document_id", doc.id);

      if (!totalChunks || totalChunks === 0) continue;

      const { count: embeddedChunks } = await supabase
        .from("document_chunks")
        .select("id", { count: "exact", head: true })
        .eq("document_id", doc.id)
        .not("embedding", "is", null);

      const progress = (embeddedChunks || 0) / totalChunks;
      if (progress < 0.6) continue; // Not enough embeddings yet

      console.log(`[stuck-docs] Triggering tag generation for "${doc.name}" (${Math.round(progress * 100)}% embedded)`);

      try {
        const resp = await fetch(
          `${supabaseUrl}/functions/v1/generate-tags`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${supabaseServiceKey}`,
            },
            body: JSON.stringify({ document_id: doc.id }),
          },
        );
        if (resp.ok) tagged++;
      } catch {
        console.error(`[stuck-docs] Failed to trigger tags for ${doc.id}`);
      }
    }
  }

  return {
    stuckFound: stuck?.length || 0,
    processed,
    untaggedFound: untagged?.length || 0,
    tagged,
  };
}
