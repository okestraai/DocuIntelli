import { useState, useCallback, useMemo, useRef } from 'react';
import { Toast } from '../components/Toast';

export function useFeedback() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Keep a ref so the stable getter always returns current toasts
  const toastsRef = useRef(toasts);
  toastsRef.current = toasts;

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast: Toast = { ...toast, id };

    setToasts(prev => [...prev, newToast]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const updateToast = useCallback((id: string, updates: Partial<Toast>) => {
    setToasts(prev => prev.map(toast =>
      toast.id === id ? { ...toast, ...updates } : toast
    ));
  }, []);

  const showSuccess = useCallback((title: string, message?: string, duration?: number) => {
    return addToast({ type: 'success', title, message, duration });
  }, [addToast]);

  const showError = useCallback((title: string, message?: string, duration?: number) => {
    return addToast({ type: 'error', title, message, duration });
  }, [addToast]);

  const showWarning = useCallback((title: string, message?: string, duration?: number) => {
    return addToast({ type: 'warning', title, message, duration });
  }, [addToast]);

  const showInfo = useCallback((title: string, message?: string, duration?: number) => {
    return addToast({ type: 'info', title, message, duration });
  }, [addToast]);

  const showLoading = useCallback((title: string, message?: string) => {
    return addToast({ type: 'loading', title, message, duration: 0 });
  }, [addToast]);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  // IMPORTANT: The returned object is STABLE — its reference never changes.
  // All methods are useCallback with stable deps, so useMemo deps never change.
  // `toasts` is accessed via a getter that reads from the ref, so it always
  // returns the latest array without changing the object reference.
  // This prevents infinite loops in any useEffect/useCallback that depends on
  // the feedback object (previously, including `toasts` in useMemo deps caused
  // the object reference to change on every toast add/remove, re-triggering
  // any effect with [feedback] in its dependency array).
  return useMemo(() => ({
    get toasts() { return toastsRef.current; },
    addToast,
    removeToast,
    updateToast,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showLoading,
    clearAll
  }), [addToast, removeToast, updateToast, showSuccess, showError, showWarning, showInfo, showLoading, clearAll]);
}
