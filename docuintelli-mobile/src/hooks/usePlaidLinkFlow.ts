/**
 * Plaid Link flow — NATIVE implementation
 * Uses a WebView modal to load Plaid's hosted Link interface.
 * On web, the .web.ts file is used instead (via Metro platform extensions).
 */
import { useState, useEffect, useCallback } from 'react';
import { createLinkToken, exchangePublicToken } from '../lib/financialApi';

interface NativeModalProps {
  visible: boolean;
  linkToken: string | null;
  onSuccess: (publicToken: string, institutionName: string) => Promise<void> | void;
  onClose: () => void;
}

interface PlaidLinkFlowResult {
  open: () => void;
  ready: boolean;
  loading: boolean;
  error: string | null;
  /** Native-only: pass these props to <PlaidLinkModal /> */
  nativeModal: NativeModalProps;
}

export function usePlaidLinkFlow(
  onSuccess: () => void,
): PlaidLinkFlowResult {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Create the Plaid link token on mount
  useEffect(() => {
    createLinkToken()
      .then((token) => setLinkToken(token))
      .catch((err) => setError(err?.message || 'Failed to create link token'));
  }, []);

  const open = useCallback(() => {
    if (linkToken) {
      setModalVisible(true);
    }
  }, [linkToken]);

  const handleSuccess = useCallback(async (publicToken: string, institutionName: string) => {
    setLoading(true);
    setError(null);
    try {
      await exchangePublicToken(publicToken, institutionName);
      onSuccess();
    } catch (err: any) {
      setError(err?.message || 'Failed to connect bank');
    } finally {
      setLoading(false);
    }
  }, [onSuccess]);

  const closeModal = useCallback(() => {
    setModalVisible(false);
  }, []);

  return {
    open,
    ready: !!linkToken,
    loading,
    error,
    nativeModal: {
      visible: modalVisible,
      linkToken,
      onSuccess: handleSuccess,
      onClose: closeModal,
    },
  };
}
