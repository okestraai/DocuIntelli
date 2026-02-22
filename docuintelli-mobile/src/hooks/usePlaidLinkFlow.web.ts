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

export interface PlaidNewItem {
  item_id: string;
  institution_name: string;
  accounts: any[];
}

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
  onSuccess: (newItem: PlaidNewItem) => void,
  onCancel?: () => void,
): PlaidLinkFlowResult {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hostedUrlRef = useRef<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const popupCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initialItemIdsRef = useRef<Set<string>>(new Set());

  // Fetch a Hosted Link URL (called on mount + after each flow completes)
  const fetchLinkToken = useCallback(() => {
    setReady(false);
    setError(null);
    createLinkToken()
      .then((result) => {
        if (result.hosted_link_url) {
          console.log('[PlaidLink:web] Hosted Link URL ready');
          hostedUrlRef.current = result.hosted_link_url;
          setReady(true);
        } else {
          setError('Hosted Link not available');
        }
      })
      .catch((err) => {
        console.error('[PlaidLink:web] Token creation failed:', err);
        setError(err?.message || 'Failed to create link token');
      });
  }, []);

  // Initial fetch on mount
  useEffect(() => { fetchLinkToken(); }, [fetchLinkToken]);

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

    console.log('[PlaidLink:web] Starting webhook polling (initial items:', initialItemIdsRef.current.size, ')');
    setLoading(true);
    setError(null);

    let attempts = 0;
    const maxAttempts = 8; // poll up to ~12s (shorter than native since we can't distinguish cancel from success in popup)

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
          console.log('[PlaidLink:web] New account with details detected — webhook exchange succeeded');
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
          console.log('[PlaidLink:web] Polling timed out — no new account detected (user likely cancelled)');
          fetchLinkToken(); // Prepare a fresh token for retry
          onCancel?.();
        }
      } catch {
        // network error during poll — keep trying
      }
    }, 1500);
  }, [onSuccess, onCancel, fetchLinkToken]);

  // ── Open Hosted Link in popup ───────────────────────────────────
  const open = useCallback(() => {
    if (!hostedUrlRef.current) return;
    setError(null);

    // Snapshot existing item IDs before opening
    getConnectedAccounts()
      .then((items) => {
        initialItemIdsRef.current = new Set(items.map((i: any) => i.item_id));
      })
      .catch(() => { initialItemIdsRef.current = new Set(); });

    // Open popup (same sizing as Stripe popup)
    const w = 520, h = 700;
    const left = typeof window !== 'undefined'
      ? window.screenX + (window.outerWidth - w) / 2 : 100;
    const top = typeof window !== 'undefined'
      ? window.screenY + (window.outerHeight - h) / 2 : 100;

    const popup = window.open(
      hostedUrlRef.current,
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
  }, [startPolling]);

  // Stub handlers for interface compatibility (unused on web)
  const handleBrowserRedirect = useCallback(() => {}, []);
  const handleClose = useCallback(() => {
    cleanup();
  }, [cleanup]);

  return {
    open,
    ready,
    loading,
    error,
    browserUrl: null,
    handleBrowserRedirect,
    handleClose,
  };
}
