import React, { useState, useRef, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { X, ShieldCheck, Mail, Lock, Eye, EyeOff, KeyRound, Clock } from 'lucide-react';
import { supabase, sendSignupOTP, verifySignupOTP, signIn, signInWithGoogle, resetPasswordWithOTP, verifyOTP, resendOTP } from '../lib/supabase';

interface AuthModalProps {
  onClose: () => void;
  onAuth: (user: User) => void;
}

type AuthStep = 'auth' | 'verify-signup' | 'verify-reset' | 'set-new-password';

export function AuthModal({ onClose, onAuth }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [authStep, setAuthStep] = useState<AuthStep>('auth');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // OTP digit boxes (signup flow)
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Legacy single OTP field (password reset flow only)
  const [otp, setOtp] = useState('');

  // Resend cooldown & rate limit
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resendCount, setResendCount] = useState(0);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);

  // OTP expiry countdown
  const [otpExpiresAt, setOtpExpiresAt] = useState<number | null>(null);
  const [expiryDisplay, setExpiryDisplay] = useState('');

  // ── Countdown timers ──────────────────────────────────────────────

  // Resend cooldown timer (60s after each resend)
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // OTP expiry countdown (30 min)
  useEffect(() => {
    if (!otpExpiresAt) {
      setExpiryDisplay('');
      return;
    }
    const update = () => {
      const remaining = Math.max(0, otpExpiresAt - Date.now());
      if (remaining === 0) {
        setExpiryDisplay('Expired');
      } else {
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        setExpiryDisplay(`${mins}:${secs.toString().padStart(2, '0')}`);
      }
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [otpExpiresAt]);

  // ── OTP digit input handlers ──────────────────────────────────────

  const handleOtpDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);

    // Auto-focus next input
    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newDigits = [...otpDigits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || '';
    }
    setOtpDigits(newDigits);
    const focusIndex = Math.min(pasted.length, 5);
    otpInputRefs.current[focusIndex]?.focus();
  };

  const getOtpCode = () => otpDigits.join('');

  // ── Reset helpers ─────────────────────────────────────────────────

  const resetOtpState = () => {
    setOtpDigits(['', '', '', '', '', '']);
    setOtp('');
    setResendCooldown(0);
    setResendCount(0);
    setOtpExpiresAt(null);
    setError(null);
    setSuccessMessage(null);
  };

  // ── Form submit (login / signup step 1 / forgot password) ────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (isForgotPassword) {
        if (!email) {
          setError('Please enter your email address');
          return;
        }
        await resetPasswordWithOTP(email);
        setSuccessMessage('Verification code sent! Check your email for the 6-digit code.');
        setAuthStep('verify-reset');
      } else {
        if (!email || !password) {
          setError('Please enter both email and password');
          return;
        }

        if (!isLogin) {
          if (!confirmPassword) {
            setError('Please confirm your password');
            return;
          }
          if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
          }
        }

        if (isLogin) {
          const result = await signIn(email, password);
          if (result.user) {
            onAuth(result.user);
          }
        } else {
          // Custom OTP signup — sends code, does NOT create user yet
          await sendSignupOTP(email, password);
          setSuccessMessage('Verification code sent! Check your email for the 6-digit code.');
          setAuthStep('verify-signup');
          setOtpExpiresAt(Date.now() + 30 * 60 * 1000);
          setResendCooldown(60);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication failed';
      console.error('Auth error:', err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── OTP verification ─────────────────────────────────────────────

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      if (authStep === 'verify-signup') {
        // Custom OTP flow — verify code and create account
        const otpCode = getOtpCode();

        if (otpCode.length !== 6) {
          setError('Please enter all 6 digits');
          return;
        }

        const result = await verifySignupOTP(email, otpCode);

        if (result.token_hash) {
          // Auto-login via magic link token
          const { data, error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: result.token_hash,
            type: 'magiclink',
          });

          if (verifyError) throw verifyError;
          if (data.user) {
            onAuth(data.user);
          }
        } else {
          // Fallback: account created but no auto-login token — redirect to login
          setSuccessMessage('Account created! Please sign in with your credentials.');
          setTimeout(() => {
            resetOtpState();
            setAuthStep('auth');
            setIsLogin(true);
            setPassword('');
            setConfirmPassword('');
          }, 2000);
        }
      } else {
        // Password reset flow — uses Supabase native OTP
        if (!otp || otp.length !== 6) {
          setError('Please enter a valid 6-digit code');
          return;
        }

        await verifyOTP(email, otp, 'recovery');
        // OTP verified — now show password entry form
        setError(null);
        setSuccessMessage(null);
        setAuthStep('set-new-password');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Verification failed';
      console.error('OTP verification error:', err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Resend OTP ────────────────────────────────────────────────────

  const handleResendOTP = async () => {
    if (resendCooldown > 0) return;

    setIsLoading(true);
    setError(null);

    try {
      if (authStep === 'verify-signup') {
        // Custom OTP resend
        await sendSignupOTP(email, password);
        setResendCount((prev) => prev + 1);
        setResendCooldown(60);
        setOtpDigits(['', '', '', '', '', '']);
        setOtpExpiresAt(Date.now() + 30 * 60 * 1000);
        setSuccessMessage('New verification code sent! Check your email.');
      } else {
        // Password reset resend — Supabase native
        await resendOTP(email, 'recovery');
        setSuccessMessage('New verification code sent! Check your email.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to resend code';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Google OAuth ─────────────────────────────────────────────────

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      // Browser will redirect to Google — loading state stays until navigation
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed';
      console.error('Google auth error:', err);
      setError(message);
      setIsGoogleLoading(false);
    }
  };

  // ── Set New Password (after recovery OTP verified) ──────────────

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        onAuth(user);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update password';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // ── Set New Password Screen ─────────────────────────────────────

  if (authStep === 'set-new-password') {
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 relative shadow-2xl">
          <div className="text-center mb-6 sm:mb-8">
            <div className="bg-gradient-to-br from-emerald-600 to-teal-600 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Lock className="h-7 w-7 sm:h-8 sm:w-8 text-white" strokeWidth={2.5} />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2 tracking-tight">
              Set New Password
            </h2>
            <p className="text-sm sm:text-base text-slate-600">
              Create a new password for <strong>{email}</strong>
            </p>
          </div>

          {error && (
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs sm:text-sm text-red-600">{error}</p>
            </div>
          )}

          <form onSubmit={handleSetNewPassword} className="space-y-4">
            <div>
              <label htmlFor="newPassword" className="block text-xs sm:text-sm font-medium text-slate-700 mb-2">
                New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4 sm:h-5 sm:w-5" />
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  id="newPassword"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-9 sm:pl-10 pr-11 sm:pr-12 py-2.5 sm:py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm sm:text-base transition-all"
                  placeholder="Enter new password"
                  required
                  disabled={isLoading}
                  minLength={6}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  disabled={isLoading}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4 sm:h-5 sm:w-5" /> : <Eye className="h-4 w-4 sm:h-5 sm:w-5" />}
                </button>
              </div>
            </div>

            <div>
              <label htmlFor="confirmNewPassword" className="block text-xs sm:text-sm font-medium text-slate-700 mb-2">
                Confirm New Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4 sm:h-5 sm:w-5" />
                <input
                  type={showConfirmNewPassword ? 'text' : 'password'}
                  id="confirmNewPassword"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  className="w-full pl-9 sm:pl-10 pr-11 sm:pr-12 py-2.5 sm:py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm sm:text-base transition-all"
                  placeholder="Confirm new password"
                  required
                  disabled={isLoading}
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  disabled={isLoading}
                >
                  {showConfirmNewPassword ? <EyeOff className="h-4 w-4 sm:h-5 sm:w-5" /> : <Eye className="h-4 w-4 sm:h-5 sm:w-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading || !newPassword || !confirmNewPassword}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-emerald-400 disabled:to-teal-400 text-white font-semibold py-2.5 sm:py-3 px-4 rounded-lg transition-all flex items-center justify-center shadow-lg hover:shadow-xl text-sm sm:text-base"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
              ) : (
                'Update Password'
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── OTP Verification Screen ───────────────────────────────────────

  if (authStep === 'verify-signup' || authStep === 'verify-reset') {
    const isSignupVerify = authStep === 'verify-signup';
    const otpComplete = isSignupVerify ? getOtpCode().length === 6 : otp.length === 6;

    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 relative shadow-2xl">
          <button
            onClick={() => {
              resetOtpState();
              setAuthStep('auth');
            }}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50 p-1 hover:bg-slate-100 rounded-lg"
            disabled={isLoading}
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>

          <div className="text-center mb-6 sm:mb-8">
            <div className="bg-gradient-to-br from-emerald-600 to-teal-600 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <KeyRound className="h-7 w-7 sm:h-8 sm:w-8 text-white" strokeWidth={2.5} />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2 tracking-tight">
              Verify Your Email
            </h2>
            <p className="text-sm sm:text-base text-slate-600">
              We sent a 6-digit code to <strong>{email}</strong>
            </p>
          </div>

          {error && (
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-xs sm:text-sm text-red-600">{error}</p>
            </div>
          )}

          {successMessage && (
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
              <p className="text-xs sm:text-sm text-emerald-600">{successMessage}</p>
            </div>
          )}

          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <div>
              <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-3 text-center">
                Verification Code
              </label>

              {isSignupVerify ? (
                /* 6 individual digit boxes for signup OTP */
                <div className="flex justify-center gap-2 sm:gap-3">
                  {otpDigits.map((digit, index) => (
                    <input
                      key={index}
                      ref={(el) => { otpInputRefs.current[index] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpDigitChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      onPaste={index === 0 ? handleOtpPaste : undefined}
                      className="w-10 h-12 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-bold border-2 border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                      disabled={isLoading}
                      autoFocus={index === 0}
                    />
                  ))}
                </div>
              ) : (
                /* Single text field for password reset OTP */
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4 sm:h-5 sm:w-5" />
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full pl-9 sm:pl-10 pr-4 py-2.5 sm:py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm sm:text-base transition-all text-center tracking-widest text-lg font-semibold"
                    placeholder="000000"
                    required
                    disabled={isLoading}
                    maxLength={6}
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                  />
                </div>
              )}
            </div>

            {/* Expiry countdown (signup flow only) */}
            {isSignupVerify && expiryDisplay && (
              <div className="flex items-center justify-center gap-1.5 text-xs sm:text-sm">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <span className={expiryDisplay === 'Expired' ? 'text-red-500 font-medium' : 'text-slate-500'}>
                  {expiryDisplay === 'Expired' ? 'Code expired — please request a new one' : `Code expires in ${expiryDisplay}`}
                </span>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !otpComplete || expiryDisplay === 'Expired'}
              className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-emerald-400 disabled:to-teal-400 text-white font-semibold py-2.5 sm:py-3 px-4 rounded-lg transition-all flex items-center justify-center shadow-lg hover:shadow-xl text-sm sm:text-base"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
              ) : (
                'Verify Code'
              )}
            </button>
          </form>

          <div className="mt-4 sm:mt-6 text-center space-y-2">
            <p className="text-slate-600 text-xs sm:text-sm">
              Didn't receive the code?{' '}
              <button
                onClick={handleResendOTP}
                className="text-emerald-600 hover:text-emerald-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isLoading || resendCooldown > 0 || (isSignupVerify && resendCount >= 3)}
              >
                {isSignupVerify ? (
                  resendCooldown > 0
                    ? `Resend in ${resendCooldown}s`
                    : resendCount >= 3
                      ? 'Too many attempts. Please try again later.'
                      : 'Resend'
                ) : (
                  'Resend'
                )}
              </button>
            </p>
            <button
              onClick={() => {
                resetOtpState();
                setAuthStep('auth');
              }}
              className="text-slate-600 hover:text-slate-700 text-xs sm:text-sm transition-colors"
              disabled={isLoading}
            >
              Back to {isSignupVerify ? 'signup' : 'password reset'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Auth Screen (Login / Signup / Forgot Password) ───────────

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 sm:p-8 relative shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50 p-1 hover:bg-slate-100 rounded-lg"
          disabled={isLoading}
        >
          <X className="h-5 w-5 sm:h-6 sm:w-6" />
        </button>

        <div className="text-center mb-6 sm:mb-8">
          <div className="bg-gradient-to-br from-emerald-600 to-teal-600 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <ShieldCheck className="h-7 w-7 sm:h-8 sm:w-8 text-white" strokeWidth={2.5} />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2 tracking-tight">
            {isForgotPassword ? 'Reset Password' : isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            {isForgotPassword
              ? 'Enter your email to receive a verification code'
              : isLogin
              ? 'Sign in to access your secure document vault'
              : 'Join thousands who trust DocuIntelli AI with their documents'
            }
          </p>
        </div>

        {error && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs sm:text-sm text-red-600">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <p className="text-xs sm:text-sm text-emerald-600">{successMessage}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-xs sm:text-sm font-medium text-slate-700 mb-2">
              Email Address
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4 sm:h-5 sm:w-5" />
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 sm:pl-10 pr-4 py-2.5 sm:py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm sm:text-base transition-all"
                placeholder="Enter your email"
                required
                disabled={isLoading}
              />
            </div>
          </div>

          {!isForgotPassword && (
            <>
              <div>
                <label htmlFor="password" className="block text-xs sm:text-sm font-medium text-slate-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4 sm:h-5 sm:w-5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    id="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 sm:pl-10 pr-11 sm:pr-12 py-2.5 sm:py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm sm:text-base transition-all"
                    placeholder="Enter your password"
                    required
                    disabled={isLoading}
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    disabled={isLoading}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4 sm:h-5 sm:w-5" /> : <Eye className="h-4 w-4 sm:h-5 sm:w-5" />}
                  </button>
                </div>
              </div>

              {!isLogin && (
                <div>
                  <label htmlFor="confirmPassword" className="block text-xs sm:text-sm font-medium text-slate-700 mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 h-4 w-4 sm:h-5 sm:w-5" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      id="confirmPassword"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-9 sm:pl-10 pr-11 sm:pr-12 py-2.5 sm:py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm sm:text-base transition-all"
                      placeholder="Confirm your password"
                      required
                      disabled={isLoading}
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      disabled={isLoading}
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4 sm:h-5 sm:w-5" /> : <Eye className="h-4 w-4 sm:h-5 sm:w-5" />}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          <button
            type="submit"
            disabled={isLoading || isGoogleLoading}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-emerald-400 disabled:to-teal-400 text-white font-semibold py-2.5 sm:py-3 px-4 rounded-lg transition-all flex items-center justify-center shadow-lg hover:shadow-xl text-sm sm:text-base"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
            ) : (
              isForgotPassword ? 'Send Reset Code' : isLogin ? 'Sign In' : 'Continue'
            )}
          </button>
        </form>

        {/* Google OAuth divider & button — shown on login/signup, not forgot password */}
        {!isForgotPassword && (
          <>
            <div className="relative my-5 sm:my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-xs sm:text-sm">
                <span className="bg-white px-3 text-slate-400">or</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isLoading || isGoogleLoading}
              className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed text-slate-700 font-medium py-2.5 sm:py-3 px-4 rounded-lg transition-all shadow-sm hover:shadow text-sm sm:text-base"
            >
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
          </>
        )}

        <div className="mt-4 sm:mt-6 text-center space-y-2 sm:space-y-3">
          {!isForgotPassword && isLogin && (
            <button
              onClick={() => setIsForgotPassword(true)}
              className="text-emerald-600 hover:text-emerald-700 font-medium text-xs sm:text-sm block w-full transition-colors"
              disabled={isLoading}
            >
              Forgot your password?
            </button>
          )}

          <p className="text-slate-600 text-xs sm:text-sm">
            {isForgotPassword ? (
              <>
                Remember your password?{' '}
                <button
                  onClick={() => {
                    setIsForgotPassword(false);
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className="text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                  disabled={isLoading}
                >
                  Sign in
                </button>
              </>
            ) : isLogin ? (
              <>
                Don't have an account?{' '}
                <button
                  onClick={() => setIsLogin(false)}
                  className="text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                  disabled={isLoading}
                >
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button
                  onClick={() => setIsLogin(true)}
                  className="text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                  disabled={isLoading}
                >
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>

        {!isLogin && (
          <div className="mt-4 sm:mt-6 p-3 sm:p-4 bg-gradient-to-br from-emerald-50 to-teal-50 rounded-lg border border-emerald-200">
            <div className="flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 flex-shrink-0 mt-0.5" strokeWidth={2} />
              <div>
                <p className="text-xs sm:text-sm font-medium text-emerald-900">Your privacy is protected</p>
                <p className="text-xs sm:text-sm text-emerald-700 mt-1">
                  All documents are encrypted end-to-end. We never access your personal information.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
