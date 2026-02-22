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

export interface PlaidNewItem {
  item_id: string;
  institution_name: string;
  accounts: any[];
}

export function usePlaidLinkFlow(
  onSuccess: (newItem: PlaidNewItem) => void,
  onCancel?: () => void,
): PlaidLinkFlowResult {
  const [ready, setReady] = useState(false);
  const [browserUrl, setBrowserUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hostedUrlRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialItemIdsRef = useRef<Set<string>>(new Set());
  const browserWasOpenRef = useRef(false);

  // Fetch a Hosted Link URL (called on mount + after each flow completes)
  const fetchLinkToken = useCallback(() => {
    setReady(false);
    setError(null);
    createLinkToken()
      .then((result) => {
        if (result.hosted_link_url) {
          hostedUrlRef.current = result.hosted_link_url;
          setReady(true);
        } else {
          setError('Hosted Link not available');
        }
      })
      .catch((err) => setError(err?.message || 'Failed to create link token'));
  }, []);

  // Initial fetch on mount
  useEffect(() => { fetchLinkToken(); }, [fetchLinkToken]);

  // Snapshot existing item IDs when browser opens (to detect new items later)
  useEffect(() => {
    if (browserUrl) {
      browserWasOpenRef.current = true;
      getConnectedAccounts()
        .then((items) => {
          initialItemIdsRef.current = new Set(items.map((i: any) => i.item_id));
        })
        .catch(() => { initialItemIdsRef.current = new Set(); });
    }
  }, [browserUrl]);

  const open = useCallback(() => {
    if (!hostedUrlRef.current) return;
    setError(null);
    setBrowserUrl(hostedUrlRef.current);
  }, []);

  // ── Core polling logic ────────────────────────────────────────
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);

    console.log('[PlaidLink] Starting webhook polling (initial items:', initialItemIdsRef.current.size, ')');
    setLoading(true);
    setError(null);

    let attempts = 0;
    const maxAttempts = 12; // poll up to ~18s

    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const items = await getConnectedAccounts();
        // Find a new item not in the initial snapshot that has sub-accounts populated
        const newItem = items.find(
          (item: any) => !initialItemIdsRef.current.has(item.item_id) && item.accounts && item.accounts.length > 0,
        );

        if (newItem) {
          // ✅ Success — new account detected
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setLoading(false);
          console.log('[PlaidLink] New account with details detected — webhook exchange succeeded');
          fetchLinkToken(); // Prepare a fresh token for the next connection
          onSuccess({
            item_id: newItem.item_id,
            institution_name: newItem.institution_name,
            accounts: newItem.accounts,
          });
        } else if (attempts >= maxAttempts) {
          // ⏱ Timeout — no new account found, user likely cancelled
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setLoading(false);
          console.log('[PlaidLink] Polling timed out — no new account detected (user likely cancelled)');
          fetchLinkToken(); // Prepare a fresh token for retry
          onCancel?.();
        }
      } catch {
        // network error during poll — keep trying
      }
    }, 1500);
  }, [onSuccess, onCancel, fetchLinkToken]);

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
      fetchLinkToken(); // Plaid consumes the token on load — get a fresh one
      onCancel?.();
    }
  }, [onCancel, fetchLinkToken]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  return {
    open,
    ready,
    loading,
    error,
    browserUrl,
    handleBrowserRedirect,
    handleClose,
  };
}
