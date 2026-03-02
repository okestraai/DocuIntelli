import { useState, useEffect } from 'react';
import { Eye, X } from 'lucide-react';
import { supabase, signOut } from '../lib/supabase';

/**
 * Persistent red banner shown when the app is being viewed as an impersonated user.
 * Detects impersonation via the ?impersonated=true query param (set by the admin
 * impersonation flow) and persists the flag in sessionStorage.
 */
export function ImpersonationBanner() {
  const [impersonating, setImpersonating] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    // Check query param on first load
    const params = new URLSearchParams(window.location.search);
    if (params.get('impersonated') === 'true') {
      sessionStorage.setItem('docuintelli_impersonated', 'true');
      // Clean URL
      params.delete('impersonated');
      const cleanUrl = params.toString()
        ? `${window.location.pathname}?${params}`
        : window.location.pathname;
      window.history.replaceState(null, '', cleanUrl);
    }

    // Check sessionStorage
    if (sessionStorage.getItem('docuintelli_impersonated') === 'true') {
      setImpersonating(true);
      // Get current user email
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user?.email) setEmail(user.email);
      });
    }
  }, []);

  const handleEndSession = async () => {
    sessionStorage.removeItem('docuintelli_impersonated');
    await signOut();
    window.close();
  };

  if (!impersonating) return null;

  return (
    <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium z-[60] relative">
      <Eye className="h-4 w-4 flex-shrink-0" />
      <span>Impersonating: {email || 'loading...'}</span>
      <button
        onClick={handleEndSession}
        className="flex items-center gap-1 px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-xs font-medium transition-colors"
      >
        <X className="h-3 w-3" />
        End Session
      </button>
    </div>
  );
}
