import React, { useState, useEffect } from 'react';
import { User, Calendar, AlertCircle } from 'lucide-react';
import { updateUserProfile, getUserProfile } from '../lib/supabase';
import { PhoneInput } from './PhoneInput';

interface OnboardingModalProps {
  onComplete: () => void;
}

export function OnboardingModal({ onComplete }: OnboardingModalProps) {
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ fullName?: string; dateOfBirth?: string; phone?: string }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Pre-populate from existing profile data (e.g. full_name backfilled from display_name)
  useEffect(() => {
    getUserProfile().then(profile => {
      if (profile) {
        if (profile.full_name) setFullName(profile.full_name);
        if (profile.date_of_birth) setDateOfBirth(profile.date_of_birth);
        if (profile.phone) setPhone(profile.phone);
      }
    }).catch(() => {});
  }, []);

  // Block Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    } else if (fullName.trim().length < 2) {
      newErrors.fullName = 'Name must be at least 2 characters';
    }

    if (!dateOfBirth) {
      newErrors.dateOfBirth = 'Date of birth is required';
    } else {
      const dob = new Date(dateOfBirth);
      const today = new Date();
      if (dob >= today) {
        newErrors.dateOfBirth = 'Date of birth must be in the past';
      }
    }

    if (!phone || !phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (phone.replace(/\D/g, '').length < 7) {
      newErrors.phone = 'Please enter a valid phone number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      await updateUserProfile({
        full_name: fullName.trim(),
        date_of_birth: dateOfBirth,
        phone: phone.trim(),
      });
      onComplete();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save profile. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-300">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-6 sm:px-8 sm:py-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-white/20 backdrop-blur-sm rounded-xl p-2.5">
              <User className="h-6 w-6 text-white" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-white">Complete Your Profile</h2>
          </div>
          <p className="text-emerald-100 text-sm sm:text-base ml-[52px]">
            We need a few details before you get started
          </p>
        </div>

        {/* Form */}
        <div className="px-6 py-6 sm:px-8 sm:py-8 space-y-5">
          {saveError && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
              <p className="text-sm text-red-700">{saveError}</p>
            </div>
          )}

          {/* Full Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Full Name <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                <User className="h-4.5 w-4.5" />
              </div>
              <input
                type="text"
                value={fullName}
                onChange={(e) => { setFullName(e.target.value); if (errors.fullName) setErrors(prev => ({ ...prev, fullName: undefined })); }}
                placeholder="Enter your full name"
                className={`w-full pl-11 pr-4 py-3 border-2 rounded-xl transition-all focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                  errors.fullName ? 'border-red-300 bg-red-50' : 'border-gray-300'
                }`}
                autoFocus
              />
            </div>
            {errors.fullName && <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.fullName}</p>}
          </div>

          {/* Date of Birth */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Date of Birth <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">
                <Calendar className="h-4.5 w-4.5" />
              </div>
              <input
                type="date"
                value={dateOfBirth}
                onChange={(e) => { setDateOfBirth(e.target.value); if (errors.dateOfBirth) setErrors(prev => ({ ...prev, dateOfBirth: undefined })); }}
                max={new Date().toISOString().split('T')[0]}
                className={`w-full pl-11 pr-4 py-3 border-2 rounded-xl transition-all focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 ${
                  errors.dateOfBirth ? 'border-red-300 bg-red-50' : 'border-gray-300'
                }`}
              />
            </div>
            {errors.dateOfBirth && <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.dateOfBirth}</p>}
          </div>

          {/* Phone Number */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Phone Number <span className="text-red-500">*</span>
            </label>
            <PhoneInput
              value={phone}
              onChange={(val) => { setPhone(val); if (errors.phone) setErrors(prev => ({ ...prev, phone: undefined })); }}
              error={!!errors.phone}
              placeholder="Enter your phone number"
            />
            {errors.phone && <p className="mt-1.5 text-xs text-red-500 font-medium">{errors.phone}</p>}
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-300 text-white py-3.5 rounded-xl font-semibold text-base transition-all shadow-lg hover:shadow-xl disabled:shadow-none flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                <span>Saving...</span>
              </>
            ) : (
              <span>Continue to Dashboard</span>
            )}
          </button>

          <p className="text-xs text-center text-gray-400">
            This information helps us personalize your experience
          </p>
        </div>
      </div>
    </div>
  );
}
