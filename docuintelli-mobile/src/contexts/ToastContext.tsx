import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import Toast from '../components/ui/Toast';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastState {
  message: string;
  type: ToastType;
  visible: boolean;
  duration: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  _toast: ToastState;
  _onDismiss: () => void;
}

const defaultToast: ToastState = { message: '', type: 'info', visible: false, duration: 3000 };

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
  _toast: defaultToast,
  _onDismiss: () => {},
});

export function useToast() {
  const { showToast } = useContext(ToastContext);
  return { showToast };
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>(defaultToast);
  const queueRef = useRef<ToastState[]>([]);
  const showingRef = useRef(false);

  const showNext = useCallback(() => {
    if (queueRef.current.length === 0) {
      showingRef.current = false;
      return;
    }
    showingRef.current = true;
    const next = queueRef.current.shift()!;
    setToast(next);
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration: number = 3000) => {
      const item: ToastState = { message, type, visible: true, duration };
      if (showingRef.current) {
        queueRef.current.push(item);
      } else {
        showingRef.current = true;
        setToast(item);
      }
    },
    [],
  );

  const handleDismiss = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
    // Show next queued toast after a brief delay
    setTimeout(showNext, 100);
  }, [showNext]);

  return (
    <ToastContext.Provider value={{ showToast, _toast: toast, _onDismiss: handleDismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

/**
 * Renders the toast notification UI. Place inside the visual container
 * where toasts should appear (e.g., webShell.inner in _layout.tsx).
 */
export function ToastRenderer() {
  const { _toast, _onDismiss } = useContext(ToastContext);
  return (
    <Toast
      message={_toast.message}
      type={_toast.type}
      visible={_toast.visible}
      onDismiss={_onDismiss}
      duration={_toast.duration}
    />
  );
}
