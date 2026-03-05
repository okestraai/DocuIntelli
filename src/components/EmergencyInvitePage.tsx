import React, { useEffect, useState } from 'react';
import { ShieldCheck, Users, Loader2, AlertCircle, CheckCircle2, XCircle, LogIn, UserPlus } from 'lucide-react';
import { validateInvite, acceptInvite, declineInvite, type InviteInfo } from '../lib/emergencyAccessApi';

interface EmergencyInvitePageProps {
  isAuthenticated: boolean;
  onNavigate: (page: string) => void;
  onShowAuth: (mode?: 'login' | 'signup') => void;
  onAccessChanged?: () => void;
}

export function EmergencyInvitePage({ isAuthenticated, onNavigate, onShowAuth, onAccessChanged }: EmergencyInvitePageProps) {
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [declined, setDeclined] = useState(false);

  // Capture token once on mount — navigateTo() may strip query params from the URL on re-render
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '');

  useEffect(() => {
    if (!token) {
      setError('No invitation token provided');
      setLoading(false);
      return;
    }
    validateInvite(token)
      .then(info => setInvite(info))
      .catch(() => setError('This invitation is invalid or has already been used'))
      .finally(() => setLoading(false));
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setAccepting(true);
    try {
      await acceptInvite(token);
      setAccepted(true);
      onAccessChanged?.();
      setTimeout(() => onNavigate('life-events'), 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = async () => {
    if (!token) return;
    try {
      await declineInvite(token);
      setDeclined(true);
    } catch {
      // Silent — decline is best-effort
      setDeclined(true);
    }
  };

  const handleAuthThenAccept = (mode: 'login' | 'signup') => {
    // Store the invite URL so we can redirect back after auth
    sessionStorage.setItem('pending_invite_redirect', window.location.href);
    onShowAuth(mode);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-red-50 flex items-center justify-center mb-6">
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Invalid Invitation</h1>
          <p className="text-slate-600 mb-6">{error || 'This invitation link is not valid.'}</p>
          <button
            onClick={() => onNavigate('landing')}
            className="text-emerald-600 hover:text-emerald-700 font-medium"
          >
            Go to DocuIntelli
          </button>
        </div>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-6">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Invitation Accepted!</h1>
          <p className="text-slate-600 mb-2">
            You are now a trusted contact for <strong>{invite.ownerName}</strong>.
          </p>
          <p className="text-slate-500 text-sm">Redirecting to your shared documents...</p>
        </div>
      </div>
    );
  }

  if (declined) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-6">
            <XCircle className="h-8 w-8 text-slate-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Invitation Declined</h1>
          <p className="text-slate-600">No worries. You won't receive further notifications about this.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-8 py-6 text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mb-4">
            <ShieldCheck className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white">DocuIntelli AI</h1>
          <p className="text-emerald-100 text-sm mt-1">Your Intelligent Document Vault</p>
        </div>

        {/* Content */}
        <div className="p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <Users className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <p className="text-lg font-semibold text-slate-900">{invite.ownerName}</p>
              <p className="text-sm text-slate-500">
                has added you as a trusted contact
                {invite.relationship && <span className="text-slate-400"> ({invite.relationship})</span>}
              </p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-100">
            <p className="text-sm text-slate-700 leading-relaxed">
              As a trusted contact, you may be granted access to view important documents
              that <strong>{invite.ownerName}</strong> has organized in their life event checklists.
              This is a read-only view for emergency or planning purposes.
            </p>
          </div>

          {isAuthenticated ? (
            <div className="space-y-3">
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all disabled:opacity-60"
              >
                {accepting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
                Accept Invitation
              </button>
              <button
                onClick={handleDecline}
                className="w-full px-6 py-3 text-slate-600 font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-all"
              >
                Decline
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-600 text-center mb-4">
                You need a DocuIntelli account to accept this invitation.
              </p>
              <button
                onClick={() => handleAuthThenAccept('signup')}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all"
              >
                <UserPlus className="h-5 w-5" />
                Create Free Account
              </button>
              <button
                onClick={() => handleAuthThenAccept('login')}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 text-slate-700 font-medium rounded-xl border border-slate-200 hover:bg-slate-50 transition-all"
              >
                <LogIn className="h-5 w-5" />
                I Already Have an Account
              </button>
              <p className="text-xs text-slate-400 text-center">
                No credit card required. Creating an account is free.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
