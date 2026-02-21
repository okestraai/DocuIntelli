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
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>({
    message: '',
    type: 'info',
    visible: false,
    duration: 3000,
  });
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
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onDismiss={handleDismiss}
        duration={toast.duration}
      />
    </ToastContext.Provider>
  );
}
