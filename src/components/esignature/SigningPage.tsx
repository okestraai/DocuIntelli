import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  FileSignature, Loader2, AlertCircle, CheckCircle2, ChevronRight, ChevronLeft,
  Lock, ExternalLink, FolderPlus, Crown, LogIn, X, Zap, ArrowLeft,
} from 'lucide-react';
import { SignatureInput } from './SignatureInput';
import { auth, signInWithGoogle } from '../../lib/auth';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface SigningPageProps {
  token?: string;
  signerId?: string;
  onBack?: () => void;
}

interface SignerInfo {
  id: string;
  name: string;
  email: string;
  status: string;
}

interface RequestInfo {
  id: string;
  title: string;
  message: string | null;
  documentName: string;
  ownerName: string;
}

interface FieldInfo {
  id: string;
  field_type: string;
  page_number: number;
  x_percent: number;
  y_percent: number;
  width_percent: number;
  height_percent: number;
  label: string | null;
  required: boolean;
  value: string | null;
}

const FIELD_LABELS: Record<string, string> = {
  signature: 'Signature',
  full_name: 'Full Name',
  initials: 'Initials',
  date_signed: 'Date Signed',
  text_field: 'Text',
  checkbox: 'Checkbox',
  title_role: 'Title / Role',
  company_name: 'Company Name',
  custom_text: 'Custom Text',
};

// localStorage keys for field memory
const MEMORY_PREFIX = 'esign_memory_';
function getFieldMemory(fieldType: string): string | null {
  try { return localStorage.getItem(MEMORY_PREFIX + fieldType); } catch { return null; }
}
function setFieldMemory(fieldType: string, value: string) {
  try { localStorage.setItem(MEMORY_PREFIX + fieldType, value); } catch {}
}

type Phase = 'loading' | 'invalid' | 'auth-required' | 'preview' | 'signing' | 'complete';

export function SigningPage({ token, signerId, onBack }: SigningPageProps) {
  // When signerId is provided, we use authenticated endpoints (no token needed)
  const useAuthFlow = !!signerId && !token;
  const [phase, setPhase] = useState<Phase>('loading');
  const [signer, setSigner] = useState<SignerInfo | null>(null);
  const [request, setRequest] = useState<RequestInfo | null>(null);
  const [fields, setFields] = useState<FieldInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [showAuthForm, setShowAuthForm] = useState<'login' | 'register' | null>(null);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // Vault capture state
  const [vaultCaptureStatus, setVaultCaptureStatus] = useState<'idle' | 'saving' | 'saved' | 'limit-reached' | 'error'>('idle');

  // PDF + signing state
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [pdfLoading, setPdfLoading] = useState(true);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<FieldInfo | null>(null);
  const [filledFields, setFilledFields] = useState<Record<string, string>>({});
  const [showSignatureInput, setShowSignatureInput] = useState(false);
  const [signatureInputType, setSignatureInputType] = useState<'signature' | 'initials'>('signature');
  const [textInputValue, setTextInputValue] = useState('');
  const [showTextModal, setShowTextModal] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);

  const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

  // Helper to get auth headers for authenticated signer flow
  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await auth.getSession();
    if (!session) return {};
    return { 'Authorization': `Bearer ${session.access_token}` };
  }, []);

  // API path helpers — token-based vs authenticated signer endpoints
  const apiPath = useCallback((endpoint: string) => {
    if (useAuthFlow) return `${API_BASE}/api/esignature/signer/${signerId}${endpoint}`;
    return `${API_BASE}/api/esignature/sign/${token}${endpoint}`;
  }, [useAuthFlow, signerId, token, API_BASE]);

  // ─── Auth Hooks ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await auth.getSession();
      if (session) {
        setIsAuthenticated(true);
        setUserId(session.user.id);
      }
    };
    checkAuth();

    const { data: { subscription } } = auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setIsAuthenticated(true);
        setUserId(session.user.id);
        setShowAuthForm(null);
        setAuthError(null);
      } else if (event === 'SIGNED_OUT') {
        setIsAuthenticated(false);
        setUserId(null);
      }
    });

    return () => { subscription.unsubscribe(); };
  }, []);

  // Validate token or signer ID
  useEffect(() => {
    (async () => {
      try {
        let url: string;
        const headers: Record<string, string> = {};

        if (useAuthFlow) {
          // Authenticated flow: wait for auth, then validate via signer ID
          const { data: { session } } = await auth.getSession();
          if (!session) {
            // Not logged in yet — wait for auth state to settle
            setPhase('loading');
            return;
          }
          url = `${API_BASE}/api/esignature/signer/${signerId}/validate`;
          headers['Authorization'] = `Bearer ${session.access_token}`;
        } else {
          url = `${API_BASE}/api/esignature/sign/${token}`;
        }

        const res = await fetch(url, { headers });
        if (!res.ok) { setPhase('invalid'); return; }
        const { data } = await res.json();
        setSigner(data.signer);
        setRequest(data.request);
        if (data.signer.status === 'signed') { setPhase('complete'); return; }

        if (useAuthFlow) {
          // Already authenticated, skip preview and go straight to signing
          await startSigningForAuth();
        } else {
          setPhase('preview');
        }
      } catch {
        setPhase('invalid');
      }
    })();
  }, [token, signerId, useAuthFlow, API_BASE, isAuthenticated]);

  // ─── Auth Handlers ──────────────────────────────────────────────────────────

  const handleLogin = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const { error } = await auth.signInWithPassword({ email: authEmail, password: authPassword });
      if (error) throw error;
    } catch (err: any) {
      setAuthError(err.message || 'Login failed');
    } finally {
      setAuthLoading(false);
    }
  }, [authEmail, authPassword]);

  const handleRegister = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const { error } = await auth.signUp({
        email: authEmail,
        password: authPassword,
        options: { data: { display_name: authName || signer?.name || '' } },
      });
      if (error) throw error;
    } catch (err: any) {
      setAuthError(err.message || 'Registration failed');
    } finally {
      setAuthLoading(false);
    }
  }, [authEmail, authPassword, authName, signer]);

  const handleGoogleSignIn = useCallback(async () => {
    setIsGoogleLoading(true);
    setAuthError(null);
    try {
      localStorage.setItem('esign_pending_token', token);
      await auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${window.location.pathname}#/sign/${token}`,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
    } catch (err: any) {
      setAuthError(err.message || 'Google sign-in failed');
      setIsGoogleLoading(false);
    }
  }, [token]);

  // When user authenticates, link account and start signing
  useEffect(() => {
    if (isAuthenticated && userId && signer && phase === 'auth-required') {
      (async () => {
        try {
          await fetch(`${API_BASE}/api/esignature/sign/${token}/link-account`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
          });
        } catch {}
        await startSigning();
      })();
    }
  }, [isAuthenticated, userId, signer, phase]);

  // ─── Signing Logic ──────────────────────────────────────────────────────────

  const startSigning = useCallback(async () => {
    try {
      const headers: Record<string, string> = useAuthFlow ? await getAuthHeaders() : {};
      // Get fields (all, including pre-filled)
      const fieldsRes = await fetch(apiPath('/fields'), {
        method: useAuthFlow ? 'GET' : 'POST',
        headers,
      });
      if (!fieldsRes.ok) throw new Error('Failed to load fields');
      const { data: fieldsData } = await fieldsRes.json();
      const allFields: FieldInfo[] = fieldsData.fields;
      setFields(allFields);

      // Initialize filledFields from already-filled values
      const filled: Record<string, string> = {};
      allFields.forEach((f: FieldInfo) => { if (f.value) filled[f.id] = f.value; });
      setFilledFields(filled);

      // Fetch saved signatures from server (for reuse across devices)
      if (isAuthenticated) {
        try {
          const authHdrs = await getAuthHeaders();
          for (const imgType of ['signature', 'initials'] as const) {
            if (!getFieldMemory(imgType)) {
              const imgRes = await fetch(`${API_BASE}/api/esignature/signature-image/${imgType}`, { headers: authHdrs });
              if (imgRes.ok) {
                const { data: imgData } = await imgRes.json();
                if (imgData?.imageData) setFieldMemory(imgType, imgData.imageData);
              }
            }
          }
        } catch {} // Non-critical
      }

      // Fetch PDF bytes directly from backend proxy (avoids CORS issues)
      setPdfUrl(apiPath('/document'));

      setPhase('signing');
    } catch (err: any) {
      setError(err.message);
    }
  }, [useAuthFlow, isAuthenticated, apiPath, getAuthHeaders, API_BASE]);

  // Used by authenticated flow (from vault) to start signing immediately
  const startSigningForAuth = useCallback(async () => {
    await startSigning();
  }, [startSigning]);

  const handleReviewAndSign = useCallback(async () => {
    if (!isAuthenticated) {
      setAuthEmail(signer?.email || '');
      setAuthName(signer?.name || '');
      setPhase('auth-required');
      setShowAuthForm('login');
      return;
    }
    if (userId && signer) {
      try {
        await fetch(`${API_BASE}/api/esignature/sign/${token}/link-account`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
      } catch {}
    }
    await startSigning();
  }, [isAuthenticated, userId, signer, token, API_BASE, startSigning]);

  // ─── PDF Rendering ──────────────────────────────────────────────────────────

  // Load PDF
  useEffect(() => {
    if (!pdfUrl) return;
    let cancelled = false;
    setPdfLoading(true);
    setPdfError(null);

    (async () => {
      try {
        const headers: Record<string, string> = useAuthFlow ? await getAuthHeaders() : {};
        const response = await fetch(pdfUrl, { headers });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const arrayBuffer = await response.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        if (cancelled) return;
        setPdfDoc(doc);
        setTotalPages(doc.numPages);
      } catch (err) {
        console.error('Failed to load PDF:', err);
        if (!cancelled) {
          setPdfError('Failed to load document');
          setPdfLoading(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [pdfUrl, useAuthFlow, getAuthHeaders]);

  // Render current page to canvas
  useEffect(() => {
    if (!pdfDoc) return;
    let cancelled = false;

    // Small delay to ensure canvas is in DOM after phase transition
    const timer = setTimeout(async () => {
      try {
        if (renderTaskRef.current) {
          try { renderTaskRef.current.cancel(); } catch {}
          renderTaskRef.current = null;
        }

        const page = await pdfDoc.getPage(currentPage);
        if (cancelled) return;

        const wrapper = wrapperRef.current;
        const availableWidth = wrapper ? wrapper.clientWidth - 32 : 700;
        const viewport = page.getViewport({ scale: 1 });
        const scale = Math.min(availableWidth / viewport.width, 2);
        const scaledViewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        setCanvasSize({ width: scaledViewport.width, height: scaledViewport.height });

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const renderTask = page.render({ canvasContext: ctx, viewport: scaledViewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;

        if (!cancelled) setPdfLoading(false);
      } catch (err: any) {
        if (err?.name !== 'RenderingCancelled') {
          console.error('Failed to render page:', err);
        }
      }
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (renderTaskRef.current) { try { renderTaskRef.current.cancel(); } catch {} }
    };
  }, [pdfDoc, currentPage]);

  // ─── Field Actions ──────────────────────────────────────────────────────────

  const pageFields = fields.filter(f => f.page_number === currentPage);
  const filledCount = Object.keys(filledFields).length;
  const totalFieldCount = fields.length;
  const requiredUnfilled = fields.filter(f => f.required && !filledFields[f.id]);
  const allRequiredFilled = requiredUnfilled.length === 0;

  const handleFieldClick = useCallback((field: FieldInfo) => {
    const isAlreadyFilled = !!filledFields[field.id];
    setActiveField(field);
    setError(null);

    const ft = field.field_type;

    // Auto-fill date immediately (no change needed — always today)
    if (ft === 'date_signed') {
      const dateVal = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
      fillField(field, dateVal);
      return;
    }

    // Toggle checkbox
    if (ft === 'checkbox') {
      fillField(field, filledFields[field.id] === 'true' ? 'false' : 'true');
      return;
    }

    // Signature / initials
    if (ft === 'signature' || ft === 'initials') {
      if (isAlreadyFilled) {
        // Already filled — open modal to let user change it
        setSignatureInputType(ft as 'signature' | 'initials');
        setShowSignatureInput(true);
        return;
      }
      const mem = getFieldMemory(ft);
      if (mem) {
        // Auto-fill with saved signature
        fillField(field, mem);
        return;
      }
      setSignatureInputType(ft as 'signature' | 'initials');
      setShowSignatureInput(true);
      return;
    }

    // Text fields — pre-populate with current value or memory
    const currentVal = filledFields[field.id];
    const mem = getFieldMemory(ft);
    setTextInputValue(currentVal || mem || '');
    setShowTextModal(true);
  }, [filledFields]);

  const fillField = useCallback(async (field: FieldInfo, value: string) => {
    setIsSubmitting(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(useAuthFlow ? await getAuthHeaders() : {}),
      };
      const res = await fetch(apiPath('/fill'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ fieldId: field.id, value }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to save field');
      }

      // Update local state
      setFilledFields(prev => ({ ...prev, [field.id]: value }));
      setFieldMemory(field.field_type, value);
      setActiveField(null);
      setShowTextModal(false);
      setShowSignatureInput(false);

      // Persist signature/initials images to server for reuse across devices
      if (isAuthenticated && (field.field_type === 'signature' || field.field_type === 'initials') && value.startsWith('data:')) {
        try {
          const authHdrs = await getAuthHeaders();
          await fetch(`${API_BASE}/api/esignature/signature-image`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHdrs },
            body: JSON.stringify({ imageType: field.field_type, imageData: value }),
          });
        } catch {} // Non-critical
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [useAuthFlow, isAuthenticated, apiPath, getAuthHeaders, API_BASE]);

  const completeSigning = useCallback(async () => {
    if (!allRequiredFilled) {
      const first = requiredUnfilled[0];
      if (first) setCurrentPage(first.page_number);
      setError('Please fill all required fields before completing');
      return;
    }
    setIsSubmitting(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(useAuthFlow ? await getAuthHeaders() : {}),
      };
      const res = await fetch(apiPath('/complete'), { method: 'POST', headers });
      if (!res.ok) throw new Error('Failed to complete signing');
      setPhase('complete');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }, [allRequiredFilled, requiredUnfilled, useAuthFlow, apiPath, getAuthHeaders]);

  // Vault capture handler
  const handleVaultCapture = useCallback(async () => {
    if (!userId || !signer) return;
    setVaultCaptureStatus('saving');
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(useAuthFlow ? await getAuthHeaders() : {}),
      };
      const res = await fetch(apiPath('/vault-capture'), {
        method: 'POST',
        headers,
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        if (errData.error?.includes('limit') || errData.code === 'DOCUMENT_LIMIT_REACHED') {
          setVaultCaptureStatus('limit-reached');
          return;
        }
        throw new Error(errData.error || 'Failed to save to vault');
      }
      setVaultCaptureStatus('saved');
    } catch {
      setVaultCaptureStatus('error');
    }
  }, [userId, signer, useAuthFlow, apiPath, getAuthHeaders]);

  // ─── Render: Loading ────────────────────────────────────────────────────────

  if (phase === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 text-emerald-600 animate-spin mx-auto mb-4" />
          <p className="text-slate-600">Loading signing request...</p>
        </div>
      </div>
    );
  }

  if (phase === 'invalid') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <AlertCircle className="h-16 w-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Invalid Signing Link</h1>
          <p className="text-slate-500 mb-6">
            This signing link is invalid, has expired, or the signature request has been voided.
          </p>
          <a href="/" className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl transition-colors">
            Go to DocuIntelli <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      </div>
    );
  }

  // ─── Render: Auth Required ──────────────────────────────────────────────────

  if (phase === 'auth-required') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-auto px-4">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 text-white">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <FileSignature className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">DocuIntelli</h1>
                  <p className="text-emerald-100 text-xs">e-Signature</p>
                </div>
              </div>
              <h2 className="text-lg font-bold">Sign in to continue</h2>
              <p className="text-emerald-100 text-sm mt-1">
                A DocuIntelli account is required to sign documents. It's free to create one.
              </p>
            </div>

            <div className="px-6 py-6 space-y-4">
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500">Signing as</p>
                <p className="text-sm font-medium text-slate-800">{signer?.name} ({signer?.email})</p>
              </div>

              {showAuthForm === 'register' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
                  <input type="text" value={authName} onChange={e => setAuthName(e.target.value)} placeholder="Your full name"
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input type="email" value={authEmail} onChange={e => setAuthEmail(e.target.value)} placeholder="your@email.com"
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input type="password" value={authPassword} onChange={e => setAuthPassword(e.target.value)}
                  placeholder={showAuthForm === 'register' ? 'Create a password (min 6 chars)' : 'Enter your password'}
                  className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  onKeyDown={e => { if (e.key === 'Enter') showAuthForm === 'register' ? handleRegister() : handleLogin(); }} />
              </div>

              {authError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{authError}</div>
              )}

              <button onClick={showAuthForm === 'register' ? handleRegister : handleLogin}
                disabled={authLoading || isGoogleLoading || !authEmail || !authPassword}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-300 text-white font-semibold rounded-xl transition-all shadow-sm">
                {authLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                  <><LogIn className="h-4 w-4" />{showAuthForm === 'register' ? 'Create Account & Sign' : 'Sign In & Continue'}</>
                )}
              </button>

              {/* Google OAuth */}
              <div className="relative my-1">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200"></div></div>
                <div className="relative flex justify-center text-xs"><span className="bg-white px-3 text-slate-400">or</span></div>
              </div>

              <button type="button" onClick={handleGoogleSignIn} disabled={authLoading || isGoogleLoading}
                className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-60 text-slate-700 font-medium py-2.5 px-4 rounded-xl transition-all shadow-sm hover:shadow text-sm">
                {isGoogleLoading ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-400 border-t-transparent"></div>
                ) : (
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                  </svg>
                )}
                Continue with Google
              </button>

              <div className="text-center">
                {showAuthForm === 'login' ? (
                  <p className="text-sm text-slate-500">
                    Don't have an account?{' '}
                    <button onClick={() => { setShowAuthForm('register'); setAuthError(null); }} className="text-emerald-600 font-medium hover:text-emerald-700">Create one for free</button>
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">
                    Already have an account?{' '}
                    <button onClick={() => { setShowAuthForm('login'); setAuthError(null); }} className="text-emerald-600 font-medium hover:text-emerald-700">Sign in</button>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Complete ───────────────────────────────────────────────────────

  if (phase === 'complete') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="max-w-md w-full mx-auto px-4">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="px-6 py-8 text-center">
              <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Signing Complete!</h1>
              <p className="text-slate-500 mb-6">
                Thank you, {signer?.name}. Your signature has been recorded with a secure audit trail.
              </p>
            </div>

            <div className="px-6 pb-6 space-y-3">
              {isAuthenticated && userId && vaultCaptureStatus === 'idle' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <FolderPlus className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-emerald-800">Save to your Vault?</p>
                      <p className="text-xs text-emerald-600 mt-0.5">Keep a copy of the signed document in your secure DocuIntelli vault.</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={handleVaultCapture} className="flex-1 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors">
                      Yes, save to my Vault
                    </button>
                    <button onClick={() => setVaultCaptureStatus('saved')} className="px-4 py-2.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors">
                      No thanks
                    </button>
                  </div>
                </div>
              )}

              {vaultCaptureStatus === 'saving' && (
                <div className="flex items-center justify-center gap-2 py-4 text-emerald-600">
                  <Loader2 className="h-5 w-5 animate-spin" /><span className="text-sm font-medium">Saving to your vault...</span>
                </div>
              )}

              {vaultCaptureStatus === 'saved' && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 mx-auto mb-1" />
                  <p className="text-sm font-medium text-emerald-800">Saved to your vault!</p>
                </div>
              )}

              {vaultCaptureStatus === 'limit-reached' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <Crown className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">Vault storage limit reached</p>
                      <p className="text-xs text-amber-600 mt-0.5">Upgrade your plan to store more documents.</p>
                    </div>
                  </div>
                  <a href="/pricing" className="block w-full text-center px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-lg transition-colors">
                    View Plans
                  </a>
                </div>
              )}

              {vaultCaptureStatus === 'error' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                  <p className="text-sm text-red-700">Failed to save. The document may not be ready yet — try again later.</p>
                </div>
              )}

              {onBack ? (
                <button onClick={onBack} className="block w-full text-center px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-medium rounded-xl transition-all shadow-sm">
                  Back to Vault
                </button>
              ) : (
                <a href="/" className="block w-full text-center px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-medium rounded-xl transition-all shadow-sm">
                  Go to DocuIntelli
                </a>
              )}
              <p className="text-xs text-slate-400 text-center">Your signed document has been securely recorded.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Preview ────────────────────────────────────────────────────────

  if (phase === 'preview') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="max-w-lg w-full mx-auto px-4">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 text-white">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <FileSignature className="h-5 w-5" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">DocuIntelli</h1>
                  <p className="text-emerald-100 text-xs">e-Signature</p>
                </div>
              </div>
              <h2 className="text-xl font-bold">Signature Requested</h2>
            </div>

            <div className="px-6 py-6 space-y-4">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Document</span>
                  <span className="text-slate-900 font-medium">{request?.documentName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">From</span>
                  <span className="text-slate-900 font-medium">{request?.ownerName}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Your Name</span>
                  <span className="text-slate-900 font-medium">{signer?.name}</span>
                </div>
              </div>

              {request?.message && (
                <div className="bg-slate-50 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-500 mb-1">Message from sender</p>
                  <p className="text-sm text-slate-700">{request.message}</p>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-slate-400">
                <Lock className="h-3.5 w-3.5" />
                <span>Your signature will be secured with a tamper-resistant audit trail</span>
              </div>

              {!isAuthenticated && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                  <LogIn className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700">You'll need to sign in or create a free DocuIntelli account to sign this document.</p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">{error}</div>
              )}

              <button onClick={handleReviewAndSign}
                className="w-full flex items-center justify-center gap-2 px-6 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-xl transition-all shadow-md">
                Review & Sign <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Signing Phase (PDF Document View) ──────────────────────────────

  const progressPercent = totalFieldCount > 0 ? (filledCount / totalFieldCount) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-200 px-4 py-3 flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {onBack && (
              <button onClick={onBack} className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0">
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <FileSignature className="h-5 w-5 text-emerald-600 flex-shrink-0" />
            <span className="text-sm font-semibold text-slate-800 truncate">{request?.documentName}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 whitespace-nowrap">{filledCount}/{totalFieldCount} fields</span>
            {allRequiredFilled && totalFieldCount > 0 && (
              <button onClick={completeSigning} disabled={isSubmitting}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-lg shadow-sm transition-all disabled:opacity-50">
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Complete Signing'}
              </button>
            )}
          </div>
        </div>
        {/* Progress bar */}
        <div className="max-w-4xl mx-auto mt-2">
          <div className="w-full bg-slate-200 rounded-full h-1.5">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </div>

      {/* Page navigation */}
      {totalPages > 1 && (
        <div className="bg-white border-b border-slate-200 px-4 py-2 flex-shrink-0">
          <div className="max-w-4xl mx-auto flex items-center justify-center gap-3">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors">
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>

            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => {
                const pageHasUnfilled = fields.some(f => f.page_number === p && !filledFields[f.id]);
                const pageHasFields = fields.some(f => f.page_number === p);
                return (
                  <button key={p} onClick={() => setCurrentPage(p)}
                    className={`w-7 h-7 rounded-full text-xs font-medium transition-all ${
                      p === currentPage
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : pageHasUnfilled
                          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          : pageHasFields
                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                    }`}>
                    {p}
                  </button>
                );
              })}
            </div>

            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30 transition-colors">
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
          </div>
        </div>
      )}

      {/* PDF document area */}
      <div ref={wrapperRef} className="flex-1 overflow-auto p-4">
        {pdfError && (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
              <p className="text-slate-600">{pdfError}</p>
            </div>
          </div>
        )}

        {!pdfError && (
          <div className="relative mx-auto shadow-lg bg-white" style={{ width: canvasSize.width || 'auto', minHeight: pdfLoading ? 600 : canvasSize.height || 'auto' }}>
            {/* Loading overlay */}
            {pdfLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10 bg-white/80">
                <Loader2 className="h-10 w-10 text-emerald-600 animate-spin" />
              </div>
            )}
            <canvas ref={canvasRef} className="block" />

            {/* Field overlays */}
            {pageFields.map(field => {
              const isFilled = !!filledFields[field.id];
              const isActive = activeField?.id === field.id;
              const hasMem = !isFilled && !!getFieldMemory(field.field_type);
              const value = filledFields[field.id];

              return (
                <div
                  key={field.id}
                  onClick={() => handleFieldClick(field)}
                  className={`absolute border-2 rounded transition-all cursor-pointer group ${
                    isFilled
                      ? 'border-emerald-400 bg-emerald-50/70 hover:border-emerald-500'
                      : isActive
                        ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-300'
                        : 'border-amber-400 bg-amber-50/70 hover:bg-amber-100/80 animate-pulse'
                  }`}
                  style={{
                    left: `${field.x_percent}%`,
                    top: `${field.y_percent}%`,
                    width: `${field.width_percent}%`,
                    height: `${field.height_percent}%`,
                    minWidth: 40,
                    minHeight: 24,
                  }}
                >
                  {/* Unfilled field label */}
                  {!isFilled && (
                    <div className="absolute inset-0 flex items-center justify-center gap-1 px-1">
                      {hasMem && <Zap className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                      <span className="text-[10px] font-semibold text-amber-700 truncate">
                        {FIELD_LABELS[field.field_type] || field.field_type}
                      </span>
                    </div>
                  )}

                  {/* Filled field display */}
                  {isFilled && (
                    <div className="absolute inset-0 flex items-center justify-center overflow-hidden px-1">
                      {(field.field_type === 'signature' || field.field_type === 'initials') && value?.startsWith('data:') ? (
                        <img src={value} alt={field.field_type} className="max-w-full max-h-full object-contain" />
                      ) : field.field_type === 'checkbox' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <span className="text-[10px] font-medium text-emerald-800 truncate">{value}</span>
                      )}
                      {/* Change indicator on hover */}
                      <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
                        <span className="text-[9px] font-semibold text-white bg-slate-800/80 px-1.5 py-0.5 rounded">Change</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="bg-white border-t border-slate-200 px-4 py-3 flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="text-xs text-slate-500">
            {requiredUnfilled.length > 0
              ? <span className="text-amber-600 font-medium">{requiredUnfilled.length} required field{requiredUnfilled.length > 1 ? 's' : ''} remaining</span>
              : <span className="text-emerald-600 font-medium">All fields complete</span>
            }
          </div>

          {error && (
            <p className="text-xs text-red-600 mx-4 truncate max-w-xs">{error}</p>
          )}

          <button onClick={completeSigning} disabled={!allRequiredFilled || isSubmitting}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-300 rounded-xl shadow-sm transition-all">
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Complete Signing'}
          </button>
        </div>
      </div>

      {/* Signature input modal */}
      {showSignatureInput && activeField && (
        <SignatureInput
          type={signatureInputType}
          title={signatureInputType === 'initials' ? 'Add Initials' : 'Add Signature'}
          onCancel={() => { setShowSignatureInput(false); setActiveField(null); }}
          onSave={async (imageData) => {
            setShowSignatureInput(false);
            await fillField(activeField, imageData);
          }}
        />
      )}

      {/* Text field input modal */}
      {showTextModal && activeField && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-900">
                {activeField.label || FIELD_LABELS[activeField.field_type] || 'Enter Value'}
              </h3>
              <button onClick={() => { setShowTextModal(false); setActiveField(null); }}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {getFieldMemory(activeField.field_type) && (
                <button
                  onClick={() => fillField(activeField, getFieldMemory(activeField.field_type)!)}
                  disabled={isSubmitting}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-medium rounded-xl hover:bg-amber-100 transition-colors">
                  <Zap className="h-4 w-4" />
                  Use saved: "{getFieldMemory(activeField.field_type)!.substring(0, 30)}{(getFieldMemory(activeField.field_type)?.length || 0) > 30 ? '...' : ''}"
                </button>
              )}

              <input
                type="text"
                value={textInputValue}
                onChange={e => setTextInputValue(e.target.value)}
                placeholder={FIELD_LABELS[activeField.field_type] || 'Enter value'}
                className="w-full px-4 py-3 border border-slate-300 rounded-xl text-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && textInputValue.trim()) fillField(activeField, textInputValue.trim()); }}
              />

              <div className="flex items-center gap-3">
                <button onClick={() => { setShowTextModal(false); setActiveField(null); }}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-800 border border-slate-300 rounded-xl transition-colors">
                  Cancel
                </button>
                <button onClick={() => { if (textInputValue.trim()) fillField(activeField, textInputValue.trim()); }}
                  disabled={!textInputValue.trim() || isSubmitting}
                  className="flex-1 px-4 py-2.5 text-sm font-medium text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-300 rounded-xl shadow-sm transition-all">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Apply'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
