import { useState, useEffect } from 'react';
import {
  isBiometricAvailable,
  getBiometricType,
  authenticate,
  isBiometricEnabled,
  setBiometricEnabled,
} from '../services/biometricAuth';

export function useBiometrics() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [biometricType, setBiometricType] = useState('Biometric');

  useEffect(() => {
    (async () => {
      const avail = await isBiometricAvailable();
      setAvailable(avail);
      if (avail) {
        const type = await getBiometricType();
        setBiometricType(type);
        const en = await isBiometricEnabled();
        setEnabled(en);
      }
    })();
  }, []);

  const toggleBiometric = async () => {
    if (!available) return;

    if (!enabled) {
      // Authenticate first before enabling
      const success = await authenticate(`Enable ${biometricType} for DocuIntelli`);
      if (success) {
        await setBiometricEnabled(true);
        setEnabled(true);
      }
    } else {
      await setBiometricEnabled(false);
      setEnabled(false);
    }
  };

  const promptBiometric = async (): Promise<boolean> => {
    if (!available || !enabled) return true; // skip if not set up
    return authenticate();
  };

  return {
    available,
    enabled,
    biometricType,
    toggleBiometric,
    promptBiometric,
  };
}
