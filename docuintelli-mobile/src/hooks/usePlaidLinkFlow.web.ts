/**
 * Plaid Link flow — WEB implementation
 * Opens Plaid Link in a browser popup (same pattern as Stripe Manage Billing).
 * The popup loads /plaid-link-popup on the Express server, which runs the
 * Plaid Drop-in SDK. Results are sent back via window.postMessage.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createLinkToken, exchangePublicToken } from '../lib/financialApi';
import { API_BASE } from '../lib/config';

interface PlaidLinkFlowResult {
  open: () => void;
  ready: boolean;
  loading: boolean;
  error: string | null;
  /** Native-only — unused on web */
  nativeModal?: undefined;
}

export function usePlaidLinkFlow(
  onSuccess: () => void,
): PlaidLinkFlowResult {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<Window | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Create the Plaid link token on mount
  useEffect(() => {
    createLinkToken()
      .then((token) => {
        console.log('[PlaidLink] Link token created');
        setLinkToken(token);
      })
      .catch((err) => {
        console.error('[PlaidLink] Token creation failed:', err);
        setError(err?.message || 'Failed to create link token');
      });
  }, []);

  // Listen for postMessage from the popup
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'plaid-link-success') {
        cleanup();
        setLoading(true);
        setError(null);
        try {
          await exchangePublicToken(
            data.publicToken,
            data.institutionName || 'Unknown Bank',
          );
          onSuccess();
        } catch (err: any) {
          setError(err?.message || 'Failed to connect bank');
        } finally {
          setLoading(false);
        }
      } else if (data.type === 'plaid-link-exit') {
        cleanup();
        if (data.error) {
          const err = data.error;
          setError(
            err.display_message || err.error_message || 'Bank connection closed'
          );
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onSuccess]);

  const cleanup = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (popupRef.current && !popupRef.current.closed) {
      popupRef.current.close();
    }
    popupRef.current = null;
  }, []);

  // Clean up on unmount
  useEffect(() => cleanup, [cleanup]);

  const handleOpen = useCallback(() => {
    if (!linkToken) {
      setError('Still loading... please try again in a moment');
      return;
    }

    setError(null);

    // Open popup (same sizing as Stripe popup in billing.tsx)
    const w = 520, h = 700;
    const left = typeof window !== 'undefined'
      ? window.screenX + (window.outerWidth - w) / 2 : 100;
    const top = typeof window !== 'undefined'
      ? window.screenY + (window.outerHeight - h) / 2 : 100;

    const popupUrl = `${API_BASE}/plaid-link-popup?token=${encodeURIComponent(linkToken)}`;

    const popup = window.open(
      popupUrl,
      'plaid_link_popup',
      `width=${w},height=${h},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`,
    );

    if (!popup) {
      setError('Popup was blocked. Please allow popups for this site.');
      return;
    }

    popupRef.current = popup;

    // Poll for popup closure (user closed without completing)
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      if (!popup || popup.closed) {
        cleanup();
      }
    }, 500);
  }, [linkToken, cleanup]);

  return {
    open: handleOpen,
    ready: !!linkToken,
    loading,
    error,
  };
}
