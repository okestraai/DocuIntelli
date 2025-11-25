import React, { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { X, Scale, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { signUp, signIn, resetPassword } from '../lib/supabase';

interface AuthModalProps {
  onClose: () => void;
  onAuth: (user: User) => void;
}

export function AuthModal({ onClose, onAuth }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
        await resetPassword(email);
        setSuccessMessage('Password reset email sent! Check your inbox for instructions.');
        setEmail('');
      } else {
        if (!email || !password) {
          setError('Please enter both email and password');
          return;
        }

        let result;
        if (isLogin) {
          result = await signIn(email, password);
        } else {
          result = await signUp(email, password);
        }

        if (result.user) {
          onAuth(result.user);
        } else if (!isLogin && result.session === null) {
          setError('Account created successfully! Please check your email to confirm your account before signing in.');
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
            <Scale className="h-7 w-7 sm:h-8 sm:w-8 text-white" strokeWidth={2.5} />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2 tracking-tight">
            {isForgotPassword ? 'Reset Password' : isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-sm sm:text-base text-slate-600">
            {isForgotPassword
              ? 'Enter your email to receive a password reset link'
              : isLogin
              ? 'Sign in to access your secure document vault'
              : 'Join thousands who trust LegalEase with their documents'
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
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-emerald-400 disabled:to-teal-400 text-white font-semibold py-2.5 sm:py-3 px-4 rounded-lg transition-all flex items-center justify-center shadow-lg hover:shadow-xl text-sm sm:text-base"
          >
            {isLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
            ) : (
              isForgotPassword ? 'Send Reset Link' : isLogin ? 'Sign In' : 'Create Account'
            )}
          </button>
        </form>

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
              <Scale className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-600 flex-shrink-0 mt-0.5" strokeWidth={2} />
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