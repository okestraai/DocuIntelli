import { useState, useEffect, useCallback } from 'react';
import * as esignApi from '../lib/esignatureApi';

/**
 * Hook to track pending signature request count.
 * Used for badge display on the Vault tab.
 */
export function usePendingSignatureCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await esignApi.getMySignatures();
      const pending = res.data.received.filter(
        (r) => r.signer_status !== 'signed' && r.signer_status !== 'declined'
      ).length;
      setCount(pending);
    } catch {
      // Silent — non-critical
    }
  }, []);

  useEffect(() => {
    refresh();
    // Poll every 2 minutes
    const interval = setInterval(refresh, 120_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { count, refresh };
}

/**
 * Hook to wrap AsyncStorage field memory with React state.
 * Useful for pre-filling form fields in signing flows.
 */
export function useFieldMemory(fieldType: string) {
  const [value, setValue] = useState<string | null>(null);

  useEffect(() => {
    esignApi.getFieldMemory(fieldType).then(setValue);
  }, [fieldType]);

  const save = useCallback(async (newValue: string) => {
    setValue(newValue);
    await esignApi.setFieldMemory(fieldType, newValue);
  }, [fieldType]);

  return { value, save };
}
