/**
 * Plaid Link flow — NATIVE via Hosted Link + InAppBrowser
 * Same pattern as Stripe checkout in billing.tsx.
 * On web, the .web.ts file is used instead (via Metro platform extensions).
 *
 * With Hosted Link, the public_token is delivered via webhook (LINK/ITEM_ADD_RESULT),
 * NOT in the redirect URL. The redirect just brings the user back to the app.
 * The server handles the exchange automatically via the webhook.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createLinkToken, getConnectedAccounts } from '../lib/financialApi';

interface PlaidLinkFlowResult {
  open: () => void;
  ready: boolean;
  loading: boolean;
  error: string | null;
  /** URL for InAppBrowser — non-null when browser should be open */
  browserUrl: string | null;
  /** Called when InAppBrowser catches a redirect (custom scheme or URL match) */
  handleBrowserRedirect: (url?: string) => void;
  /** Called when the user closes the InAppBrowser (X button or back).
   *  Starts polling if the browser was opened (user may have completed flow). */
  handleClose: () => void;
}

export function usePlaidLinkFlow(
  onSuccess: () => void,
  onCancel?: () => void,
): PlaidLinkFlowResult {
  const [hostedUrl, setHostedUrl] = useState<string | null>(null);
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialCountRef = useRef<number>(-1);
  const browserWasOpenRef = useRef(false);

  // Fetch Hosted Link URL on mount
  useEffect(() => {
    createLinkToken()
      .then((result) => {
        if (result.hosted_link_url) {
          setHostedUrl(result.hosted_link_url);
        } else {
          setError('Hosted Link not available');
        }
      })
      .catch((err) => setError(err?.message || 'Failed to create link token'));
  }, []);

  // Snapshot account count when browser opens (to detect new accounts later)
  useEffect(() => {
    if (browserUrl) {
      browserWasOpenRef.current = true;
      getConnectedAccounts()
        .then((accts) => { initialCountRef.current = accts.length; })
        .catch(() => { initialCountRef.current = 0; });
    }
  }, [browserUrl]);

  const open = useCallback(() => {
    if (!hostedUrl) return;
    setError(null);
    setBrowserUrl(hostedUrl);
  }, [hostedUrl]);

  // ── Core polling logic ────────────────────────────────────────
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);

    console.log('[PlaidLink] Starting webhook polling (initial accounts:', initialCountRef.current, ')');
    setLoading(true);
    setError(null);

    let attempts = 0;
    const maxAttempts = 12; // poll up to ~18s

    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const items = await getConnectedAccounts();
        // Wait until a NEW item appears AND has sub-accounts populated.
        const hasNewFullItem =
          items.length > initialCountRef.current &&
          items.every((item: any) => item.accounts && item.accounts.length > 0);

        if (hasNewFullItem) {
          // ✅ Success — new account detected
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setLoading(false);
          console.log('[PlaidLink] New account with details detected — webhook exchange succeeded');
          onSuccess();
        } else if (attempts >= maxAttempts) {
          // ⏱ Timeout — no new account found, user likely cancelled
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setLoading(false);
          console.log('[PlaidLink] Polling timed out — no new account detected (user likely cancelled)');
          onCancel?.();
        }
      } catch {
        // network error during poll — keep trying
      }
    }, 1500);
  }, [onSuccess, onCancel]);

  // ── Redirect handler (completion signal from WebView) ────────
  const handleBrowserRedirect = useCallback((url?: string) => {
    setBrowserUrl(null);
    browserWasOpenRef.current = false;

    if (!url) return;

    // Accept both /plaid-callback redirect AND success-text detection
    const isCompletion = url.includes('/plaid-callback') || url.startsWith('plaid-success://');
    if (!isCompletion) return;

    console.log('[PlaidLink] Completion signal intercepted:', url);
    startPolling();
  }, [startPolling]);

  // ── Close handler (user taps X or back button) ───────────────
  const handleClose = useCallback(() => {
    setBrowserUrl(null);
    browserWasOpenRef.current = false;

    // If polling was already started (from handleBrowserRedirect via success
    // text detection or URL intercept), don't interfere.
    // Otherwise, the user tapped X to cancel — dismiss immediately.
    if (!pollRef.current) {
      console.log('[PlaidLink] Browser closed by user — treating as cancel');
      onCancel?.();
    }
  }, [onCancel]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return {
    open,
    ready: !!hostedUrl,
    loading,
    error,
    browserUrl,
    handleBrowserRedirect,
    handleClose,
  };
}
