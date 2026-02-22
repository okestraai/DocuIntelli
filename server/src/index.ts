import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import uploadRoutes from "./routes/upload";
import processingRoutes from "./routes/processing";
import engagementRoutes from "./routes/engagement";
import subscriptionRoutes from "./routes/subscription";
import lifeEventsRoutes from "./routes/lifeEvents";
import emailRoutes from "./routes/email";
import pricingRoutes from "./routes/pricing";
import globalSearchRoutes from "./routes/globalSearch";
import globalChatRoutes from "./routes/globalChat";
import deviceRoutes from "./routes/devices";
import financialInsightsRoutes from "./routes/financialInsights";
import financialGoalsRoutes from "./routes/financialGoals";
import plaidWebhookRoutes from "./routes/plaidWebhook";
import dunningRoutes from "./routes/dunning";
import { startEmbeddingMonitor } from "./services/embeddingMonitor";
import { verifyEmailConnection } from "./services/emailService";
import { initRedis, getRedisClient } from "./services/redisClient";
import { RedisStore } from "rate-limit-redis";

const app = express();
const PORT = process.env.PORT || 5000;

// Trust first proxy (Cloudflare, nginx, etc.) so rate limiting uses real client IPs
app.set('trust proxy', 1);

console.log("🔧 Environment Check:", {
  SUPABASE_URL: process.env.SUPABASE_URL ? "✓ Set" : "✗ Missing",
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? "✓ Set" : "✗ Missing",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? "✓ Set" : "✗ Missing",
});

// ── Bootstrap (async so Redis can connect before rate limiters are built) ──
(async () => {
  // 1. Connect to Redis (non-blocking — server starts even if Redis is down)
  await initRedis();

  // 2. Security headers
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  // 3. Rate limiting — uses Redis when available, falls back to MemoryStore
  function buildRateLimitStore() {
    const redis = getRedisClient();
    if (redis) {
      return new RedisStore({ sendCommand: (...args: string[]) => redis.sendCommand(args) });
    }
    return undefined;
  }

  const rateLimitStore = buildRateLimitStore();
  console.log(`🛡️  Rate limiting store: ${rateLimitStore ? 'Redis' : 'MemoryStore (single instance)'}`);

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    store: rateLimitStore,
    message: { error: "Too many requests, please try again later" },
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildRateLimitStore(),
    message: { error: "Too many requests, please try again later" },
  });

  const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildRateLimitStore(),
    message: { error: "Upload rate limit reached, please try again later" },
  });

  // 4. CORS
  const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5176",
    "http://localhost:3000",
    "http://localhost:8081",
    ...(process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map((o: string) => o.trim())
      : []),
  ];

  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      // Allow any localhost port in development
      if (origin.match(/^https?:\/\/localhost(:\d+)?$/)) return callback(null, true);
      // Allow LAN IPs for Expo mobile dev access from phone on same network
      if (origin.match(/^https?:\/\/(10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/)) return callback(null, true);
      // Allow Cloudflare Tunnels (quick tunnels + named subdomains)
      if (origin.match(/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/)) return callback(null, true);
      if (origin.match(/^https:\/\/m\.docuintelli\.com$/)) return callback(null, true);
      // Allow explicitly listed origins (production domains via ALLOWED_ORIGINS env)
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }));

  // 5. Body parsing with size limits
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // 6. Apply rate limiting to API routes
  app.use("/api/email", authLimiter);
  app.use("/api/upload", uploadLimiter);
  app.use("/api", apiLimiter);

  // Health check endpoint (before auth-gated routes)
  app.get("/api/health", (req: Request, res: Response) => {
    res.json({
      status: "OK",
      timestamp: new Date().toISOString(),
      message: "Backend server is running",
      auth: "Handled by Supabase Auth on frontend",
      redis: getRedisClient() ? "connected" : "unavailable",
    });
  });

  // ── Stripe embed proxy ──
  // Stripe pages set X-Frame-Options: DENY, blocking iframe embedding.
  // This proxy strips that header so the mobile web app (Expo Web) can
  // render Stripe checkout, portal, and invoice pages inside InAppBrowser.
  const ALLOWED_STRIPE_HOSTS = ['billing.stripe.com', 'checkout.stripe.com', 'invoice.stripe.com'];

  app.get('/api/stripe-proxy', async (req: Request, res: Response) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) {
      res.status(400).json({ error: 'url parameter required' });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      res.status(400).json({ error: 'Invalid URL' });
      return;
    }

    if (!ALLOWED_STRIPE_HOSTS.includes(parsed.hostname)) {
      res.status(403).json({ error: 'Only Stripe URLs are allowed' });
      return;
    }

    try {
      const upstream = await fetch(targetUrl, {
        redirect: 'follow',
        headers: {
          'User-Agent': req.headers['user-agent'] || 'DocuIntelli/1.0',
          'Accept': req.headers['accept'] || 'text/html,application/xhtml+xml,*/*',
          'Accept-Language': req.headers['accept-language'] || 'en-US,en;q=0.9',
        },
      });

      // Remove Helmet's X-Frame-Options before setting upstream headers
      res.removeHeader('X-Frame-Options');
      res.removeHeader('Content-Security-Policy');

      // Copy upstream headers, stripping frame-blocking ones
      upstream.headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (lower === 'x-frame-options') return;
        if (lower === 'content-security-policy') return;
        if (lower === 'content-security-policy-report-only') return;
        if (lower === 'transfer-encoding') return;
        res.setHeader(key, value);
      });

      // Ensure no frame-blocking headers remain (Helmet may re-add)
      res.removeHeader('X-Frame-Options');
      res.removeHeader('Content-Security-Policy');

      let body = Buffer.from(await upstream.arrayBuffer());

      // For HTML responses: inject <base href> so relative URLs (JS, CSS,
      // images) resolve to the original Stripe origin, not localhost.
      const contentType = upstream.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        // Determine the final origin (after redirects)
        const finalUrl = upstream.url || targetUrl;
        const origin = new URL(finalUrl).origin;
        const baseTag = `<base href="${origin}/">`;

        let html = body.toString('utf-8');
        if (html.includes('<head>')) {
          html = html.replace('<head>', `<head>${baseTag}`);
        } else if (html.includes('<head ')) {
          html = html.replace(/<head\s[^>]*>/, `$&${baseTag}`);
        } else if (html.includes('<HEAD>')) {
          html = html.replace('<HEAD>', `<HEAD>${baseTag}`);
        }
        body = Buffer.from(html, 'utf-8');
        res.setHeader('content-length', body.length);
      }

      res.status(upstream.status).send(body);
    } catch (err) {
      console.error('Stripe proxy error:', err);
      res.status(502).json({ error: 'Failed to load page' });
    }
  });

  // ── Plaid Link popup page ──
  // Serves a minimal HTML page that opens Plaid Link using the Drop-in SDK.
  // The mobile web app opens this in a popup (like Stripe checkout).
  // On success/exit, the page sends the result via postMessage to the opener.
  app.get('/plaid-link-popup', (_req: Request, res: Response) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
  <title>Connect Your Bank — DocuIntelli</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
         background:#f8fafc;display:flex;align-items:center;justify-content:center;
         min-height:100vh;color:#334155}
    .loading{text-align:center;padding:2rem}
    .loading h2{font-size:1.25rem;margin-bottom:.5rem}
    .loading p{color:#64748b;font-size:.875rem}
    .spinner{width:40px;height:40px;margin:0 auto 1rem;border:3px solid #e2e8f0;
             border-top-color:#059669;border-radius:50%;animation:spin 1s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .error{color:#dc2626;text-align:center;padding:2rem}
    .error button{margin-top:1rem;padding:.5rem 1.5rem;background:#059669;color:#fff;
                  border:none;border-radius:8px;font-size:.875rem;cursor:pointer}
  </style>
</head>
<body>
  <div class="loading" id="loadingState">
    <div class="spinner"></div>
    <h2>Connecting to your bank...</h2>
    <p>Plaid secure connection loading</p>
  </div>
  <div class="error" id="errorState" style="display:none">
    <h2>Connection Error</h2>
    <p id="errorMsg"></p>
    <button onclick="window.close()">Close</button>
  </div>
  <script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
  <script>
    var params = new URLSearchParams(window.location.search);
    var token = params.get('token');
    var isMobile = params.get('mobile') === '1';
    // Store the link token so the OAuth redirect page can retrieve it
    try { sessionStorage.setItem('plaid_link_token', token || ''); } catch(e){}
    if (!token) {
      showError('No link token provided');
    } else if (typeof Plaid === 'undefined') {
      showError('Failed to load Plaid SDK');
    } else {
      try {
        var handler = Plaid.create({
          token: token,
          onSuccess: function(publicToken, metadata) {
            var instName = metadata && metadata.institution ? metadata.institution.name : 'Unknown Bank';
            if (isMobile) {
              // Mobile WebView: use ReactNativeWebView.postMessage (the official RN WebView bridge)
              // Falls back to plaidlink:// URL scheme if bridge isn't available
              var mobilePayload = JSON.stringify({ type:'plaid-link-success', publicToken:publicToken, institutionName:instName });
              if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                window.ReactNativeWebView.postMessage(mobilePayload);
              } else {
                window.location.href = 'plaidlink://connected?public_token='
                  + encodeURIComponent(publicToken)
                  + '&institution_name=' + encodeURIComponent(instName);
              }
            } else {
              var payload = { type:'plaid-link-success', publicToken:publicToken, institutionName:instName };
              var sent = false;
              // Try postMessage first (works on desktop popups)
              try { if (window.opener) { window.opener.postMessage(payload, '*'); sent = true; } } catch(e){}
              // Fallback: localStorage bridge (mobile browsers where window.opener is null)
              if (!sent) {
                try { localStorage.setItem('plaid_link_result', JSON.stringify(payload)); } catch(e){}
              }
              setTimeout(function(){ window.close(); }, 300);
            }
          },
          onExit: function(err, metadata) {
            if (isMobile) {
              var mobilePayload = JSON.stringify({ type:'plaid-link-exit', error:err||null });
              if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
                window.ReactNativeWebView.postMessage(mobilePayload);
              } else {
                window.location.href = 'plaidlink://exit';
              }
            } else {
              var payload = { type:'plaid-link-exit', error:err||null };
              var sent = false;
              try { if (window.opener) { window.opener.postMessage(payload, '*'); sent = true; } } catch(e){}
              if (!sent) {
                try { localStorage.setItem('plaid_link_result', JSON.stringify(payload)); } catch(e){}
              }
              setTimeout(function(){ window.close(); }, 300);
            }
          },
          onLoad: function() {
            document.getElementById('loadingState').style.display = 'none';
          },
          onEvent: function(eventName) {
            console.log('[PlaidLink popup] event:', eventName);
          }
        });
        handler.open();
      } catch (e) {
        showError(e.message || 'Failed to initialize');
      }
    }
    function showError(msg) {
      document.getElementById('loadingState').style.display = 'none';
      document.getElementById('errorState').style.display = 'block';
      document.getElementById('errorMsg').textContent = msg;
    }
  </script>
</body>
</html>`);
  });

  // ── Plaid OAuth redirect page ──
  // After OAuth-based bank auth, Plaid redirects here with query params.
  // This page re-initializes Plaid Link with receivedRedirectUri, which
  // triggers the onSuccess callback that the original page lost during redirects.
  app.get('/plaid-oauth-redirect', (_req: Request, res: Response) => {
    res.removeHeader('X-Frame-Options');
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"/>
  <title>Connecting... — DocuIntelli</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
         background:#f8fafc;display:flex;align-items:center;justify-content:center;
         min-height:100vh;color:#334155}
    .loading{text-align:center;padding:2rem}
    .loading h2{font-size:1.25rem;margin-bottom:.5rem}
    .loading p{color:#64748b;font-size:.875rem}
    .spinner{width:40px;height:40px;margin:0 auto 1rem;border:3px solid #e2e8f0;
             border-top-color:#059669;border-radius:50%;animation:spin 1s linear infinite}
    @keyframes spin{to{transform:rotate(360deg)}}
    .error{color:#dc2626;text-align:center;padding:2rem}
    .error button{margin-top:1rem;padding:.5rem 1.5rem;background:#059669;color:#fff;
                  border:none;border-radius:8px;font-size:.875rem;cursor:pointer}
  </style>
</head>
<body>
  <div class="loading" id="loadingState">
    <div class="spinner"></div>
    <h2>Finishing bank connection...</h2>
    <p>Please wait while we complete the setup</p>
  </div>
  <div class="error" id="errorState" style="display:none">
    <h2>Connection Error</h2>
    <p id="errorMsg"></p>
    <button onclick="window.close()">Close</button>
  </div>
  <script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
  <script>
    // Retrieve the link token that was stored before the OAuth redirect
    var linkToken = sessionStorage.getItem('plaid_link_token');

    if (!linkToken) {
      showError('Session expired. Please close this window and try connecting again.');
    } else if (typeof Plaid === 'undefined') {
      showError('Failed to load Plaid SDK');
    } else {
      try {
        var handler = Plaid.create({
          token: linkToken,
          receivedRedirectUri: window.location.href,
          onSuccess: function(publicToken, metadata) {
            var instName = metadata && metadata.institution ? metadata.institution.name : 'Unknown Bank';
            // Use plaidlink:// scheme for native WebView interception
            window.location.href = 'plaidlink://connected?public_token='
              + encodeURIComponent(publicToken)
              + '&institution_name=' + encodeURIComponent(instName);
          },
          onExit: function(err, metadata) {
            window.location.href = 'plaidlink://exit';
          },
          onLoad: function() {
            document.getElementById('loadingState').style.display = 'none';
          },
          onEvent: function(eventName) {
            console.log('[PlaidLink OAuth redirect] event:', eventName);
          }
        });
        handler.open();
      } catch (e) {
        showError(e.message || 'Failed to initialize');
      }
    }
    function showError(msg) {
      document.getElementById('loadingState').style.display = 'none';
      document.getElementById('errorState').style.display = 'block';
      document.getElementById('errorMsg').textContent = msg;
    }
  </script>
</body>
</html>`);
  });

  // Plaid Hosted Link callback — InAppBrowser intercepts this URL before it reaches
  // the server, but if it does land here (e.g. deep link fallback), show a simple page.
  app.get('/plaid-callback', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html><head><title>Plaid Connected</title>
<style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc;color:#334155}
.msg{text-align:center;padding:2rem}h2{color:#059669;margin-bottom:.5rem}</style></head>
<body><div class="msg"><h2>Bank Connected!</h2><p>You can close this window and return to the app.</p></div></body></html>`);
  });

  // 7. Routes — specific paths first, catch-all last
  app.use("/api/life-events", lifeEventsRoutes);
  app.use("/api/engagement", engagementRoutes);
  app.use("/api/subscription", subscriptionRoutes);
  app.use("/api/email", emailRoutes);
  app.use("/api/pricing", pricingRoutes);
  app.use("/api/search", globalSearchRoutes);
  app.use("/api/global-chat", globalChatRoutes);
  app.use("/api/devices", deviceRoutes);
  app.use("/api/financial/goals", financialGoalsRoutes);
  app.use("/api/financial", financialInsightsRoutes);
  app.use("/api/plaid-webhook", plaidWebhookRoutes);
  app.use("/api/dunning", dunningRoutes);
  app.use("/api/documents", processingRoutes);
  app.use("/api", uploadRoutes);

  // Serve static frontend (production / tunnel mode)
  const distPath = path.resolve(__dirname, "../../dist");
  app.use(express.static(distPath));

  // Static policy pages (server-rendered HTML, no JS required)
  const policyPages: Record<string, string> = {
    "/security-policy": "security-policy.html",
    "/data-retention": "data-retention.html",
    "/vulnerability-management": "vulnerability-management.html",
  };
  for (const [route, file] of Object.entries(policyPages)) {
    app.get(route, (_req: Request, res: Response) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.sendFile(path.join(distPath, file));
    });
  }

  // SPA catch-all: serve index.html for any non-API route
  app.get("*", (req: Request, res: Response) => {
    if (!req.path.startsWith("/api/")) {
      res.sendFile(path.join(distPath, "index.html"));
    } else {
      res.status(404).json({ error: "API route not found" });
    }
  });

  // 8. Start server
  const server = app.listen(PORT, () => {
    console.log(`🚀 Backend server running on port ${PORT}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔐 Auth: Handled by Supabase Auth (frontend)`);

    // Start automatic embedding monitor (checks every 30 minutes)
    console.log('');
    console.log('🤖 Starting automatic embedding monitor...');
    console.log('   Checking for missing embeddings every 30 minutes');
    startEmbeddingMonitor(30);

    // Verify email service connection
    if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      verifyEmailConnection().then(ok => {
        if (ok) console.log('📧 Email service (Mailjet) ready');
        else console.warn('📧 Email service connection failed — check SMTP credentials');
      });
    } else {
      console.log('📧 Email service not configured (set SMTP_USER and SMTP_PASS)');
    }
  });

  // Graceful shutdown for Windows service management (NSSM sends signals on stop)
  function gracefulShutdown(signal: string) {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
      console.log('HTTP server closed');
      const redis = getRedisClient();
      if (redis) {
        redis.quit().then(() => {
          console.log('Redis connection closed');
          process.exit(0);
        });
      } else {
        process.exit(0);
      }
    });
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
})();
