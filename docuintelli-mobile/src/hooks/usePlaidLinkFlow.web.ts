/**
 * Plaid Link flow — WEB (Expo Web) via Hosted Link + webhook + DB polling
 *
 * Same flow as native (usePlaidLinkFlow.ts):
 * 1. Fetch hosted_link_url from server (platform='mobile' → DB-backed link token)
 * 2. Open Hosted Link in a popup window
 * 3. User completes Plaid flow → Plaid sends LINK/ITEM_ADD_RESULT webhook
 * 4. Server exchanges token, stores accounts
 * 5. Popup closes → poll getConnectedAccounts() to detect new accounts
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createLinkToken, getConnectedAccounts } from '../lib/financialApi';

interface PlaidLinkFlowResult {
  open: () => void;
  ready: boolean;
  loading: boolean;
  error: string | null;
  browserUrl: string | null;
  handleBrowserRedirect: (url?: string) => void;
  handleClose: () => void;
}

export function usePlaidLinkFlow(
  onSuccess: () => void,
  onCancel?: () => void,
): PlaidLinkFlowResult {
  const [hostedUrl, setHostedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popupCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialCountRef = useRef<number>(-1);

  // Fetch Hosted Link URL on mount
  useEffect(() => {
    createLinkToken()
      .then((result) => {
        if (result.hosted_link_url) {
          console.log('[PlaidLink:web] Hosted Link URL ready');
          setHostedUrl(result.hosted_link_url);
        } else {
          setError('Hosted Link not available');
        }
      })
      .catch((err) => {
        console.error('[PlaidLink:web] Token creation failed:', err);
        setError(err?.message || 'Failed to create link token');
      });
  }, []);

  // ── Cleanup ─────────────────────────────────────────────────────
  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (popupCheckRef.current) {
      clearInterval(popupCheckRef.current);
      popupCheckRef.current = null;
    }
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    popupRef.current = null;
  }, []);

  // Clean up on unmount
  useEffect(() => cleanup, [cleanup]);

  // ── Core polling logic (same as native) ─────────────────────────
  const startPolling = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);

    console.log('[PlaidLink:web] Starting webhook polling (initial accounts:', initialCountRef.current, ')');
    setLoading(true);
    setError(null);

    let attempts = 0;
    const maxAttempts = 8; // poll up to ~12s (shorter than native since we can't distinguish cancel from success in popup)

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
          console.log('[PlaidLink:web] New account with details detected — webhook exchange succeeded');
          onSuccess();
        } else if (attempts >= maxAttempts) {
          // ⏱ Timeout — no new account found, user likely cancelled
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setLoading(false);
          console.log('[PlaidLink:web] Polling timed out — no new account detected (user likely cancelled)');
          onCancel?.();
        }
      } catch {
        // network error during poll — keep trying
      }
    }, 1500);
  }, [onSuccess, onCancel]);

  // ── Open Hosted Link in popup ───────────────────────────────────
  const open = useCallback(() => {
    if (!hostedUrl) return;
    setError(null);

    // Snapshot account count before opening
    getConnectedAccounts()
      .then((accts) => { initialCountRef.current = accts.length; })
      .catch(() => { initialCountRef.current = 0; });

    // Open popup (same sizing as Stripe popup)
    const w = 520, h = 700;
    const left = typeof window !== 'undefined'
      ? window.screenX + (window.outerWidth - w) / 2 : 100;
    const top = typeof window !== 'undefined'
      ? window.screenY + (window.outerHeight - h) / 2 : 100;

    const popup = window.open(
      hostedUrl,
      'plaid_hosted_link',
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`,
    );

    if (!popup) {
      setError('Popup was blocked. Please allow popups for this site.');
      return;
    }

    popupRef.current = popup;

    // Poll for popup closure — when user closes popup, start webhook polling
    if (popupCheckRef.current) clearInterval(popupCheckRef.current);
    popupCheckRef.current = setInterval(() => {
      if (!popup || popup.closed) {
        if (popupCheckRef.current) {
          clearInterval(popupCheckRef.current);
          popupCheckRef.current = null;
        }
        popupRef.current = null;
        // User closed the popup — they may have completed the flow
        if (!pollRef.current) {
          console.log('[PlaidLink:web] Popup closed — checking if webhook completed');
          startPolling();
        }
      }
    }, 500);
  }, [hostedUrl, startPolling]);

  // Stub handlers for interface compatibility (unused on web)
  const handleBrowserRedirect = useCallback(() => {}, []);
  const handleClose = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return {
    open,
    ready: !!hostedUrl,
    loading,
    error,
    browserUrl: null,
    handleBrowserRedirect,
    handleClose,
  };
}
