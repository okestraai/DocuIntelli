import { useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';

/**
 * Hook that provides auth state and listens for auth changes.
 * Use this in components that need reactive auth state.
 */
export function useAuth() {
  const { user, session, initialized, loading, setSession } = useAuthStore();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  return {
    user,
    session,
    initialized,
    loading,
    isAuthenticated: !!user,
  };
}
