import { useState, useCallback, useMemo } from 'react';
import { Toast } from '../components/Toast';

export function useFeedback() {
  const [toasts, setToasts] = useState<Toast[]>([]);

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

  const showLoading = useCallback((title: string, message?: string) => {
    return addToast({ type: 'loading', title, message, duration: 0 });
  }, [addToast]);

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  return useMemo(() => ({
    toasts,
    addToast,
    removeToast,
    updateToast,
    showSuccess,
    showError,
    showLoading,
    clearAll
  }), [toasts, addToast, removeToast, updateToast, showSuccess, showError, showLoading, clearAll]);
}