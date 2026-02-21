import React, { useState, useEffect, useCallback } from 'react';
import { User, Lock, Eye, EyeOff, AlertCircle, CheckCircle, CreditCard, Bell, Shield, Trash2, Calendar, FileText, BarChart3, Compass, Activity, Smartphone, Monitor, Tablet, X, Loader2 } from 'lucide-react';
import { supabase, getCurrentUser, updateUserProfile, changePassword, getUserProfile, UserProfile } from '../lib/supabase';
import { useFeedback } from '../hooks/useFeedback';
import { formatUTCDate } from '../lib/dateUtils';
import { BillingPage } from './BillingPage';
import { sendPasswordChangedEmail, sendAccountDeletedEmail, sendProfileUpdatedEmail, sendPreferencesUpdatedEmail, listDevices, removeDevice } from '../lib/api';
import type { UserDevice } from '../lib/api';
import { getDeviceId } from '../lib/deviceId';
import { PhoneInput } from './PhoneInput';

type TabType = 'profile' | 'security' | 'preferences' | 'billing' | 'devices';

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return formatUTCDate(dateStr);
}

interface AccountSettingsPageProps {
  initialTab?: TabType;
  onSubscriptionChange?: () => void;
}

export function AccountSettingsPage({ initialTab = 'profile', onSubscriptionChange }: AccountSettingsPageProps) {
  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Sync with parent when initialTab changes (e.g. navigating from Dashboard "Manage Plan")
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const [isUpdating, setIsUpdating] = useState(false);
  const feedback = useFeedback();

  // Profile form state
  const [displayName, setDisplayName] = useState('');
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');

  // Security form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Device management state
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [deviceLimit, setDeviceLimit] = useState(1);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [removingDeviceId, setRemovingDeviceId] = useState<string | null>(null);

  // Preferences state (6 granular groups)
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [billingAlerts, setBillingAlerts] = useState(true);
  const [documentAlerts, setDocumentAlerts] = useState(true);
  const [engagementDigests, setEngagementDigests] = useState(true);
  const [lifeEventAlerts, setLifeEventAlerts] = useState(true);
  const [activityAlerts, setActivityAlerts] = useState(true);

  const tabs = [
    { id: 'profile' as TabType, label: 'Profile', icon: User },
    { id: 'security' as TabType, label: 'Security', icon: Shield },
    { id: 'preferences' as TabType, label: 'Preferences', icon: Bell },
    { id: 'billing' as TabType, label: 'Billing', icon: CreditCard },
    { id: 'devices' as TabType, label: 'Devices', icon: Smartphone }
  ];

  const loadUserProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      const user = await getCurrentUser();
      if (user) {
        setUserProfile({
          id: user.id,
          email: user.email || '',
          created_at: user.created_at || '',
          last_sign_in_at: user.last_sign_in_at,
          email_confirmed_at: user.email_confirmed_at,
          display_name: user.user_metadata?.display_name || '',
          bio: user.user_metadata?.bio || ''
        });

        const profile = await getUserProfile();
        if (profile) {
          setDisplayName(profile.display_name || '');
          setFullName(profile.full_name || '');
          setDateOfBirth(profile.date_of_birth || '');
          setPhone(profile.phone || '');
          setBio(profile.bio || '');
          setSecurityAlerts(profile.security_alerts ?? true);
          setBillingAlerts(profile.billing_alerts ?? true);
          setDocumentAlerts(profile.document_alerts ?? true);
          setEngagementDigests(profile.engagement_digests ?? true);
          setLifeEventAlerts(profile.life_event_alerts ?? true);
          setActivityAlerts(profile.activity_alerts ?? true);
        } else {
          setDisplayName(user.user_metadata?.display_name || '');
          setFullName(user.user_metadata?.full_name || user.user_metadata?.name || '');
          setPhone(user.user_metadata?.phone || '');
          setBio(user.user_metadata?.bio || '');
          setSecurityAlerts(true);
          setBillingAlerts(true);
          setDocumentAlerts(true);
          setEngagementDigests(true);
          setLifeEventAlerts(true);
          setActivityAlerts(true);
        }
      }
    } catch (error) {
      console.error('Profile load error:', error);
      feedback.showError('Failed to load profile', 'Unable to fetch your profile information');
    } finally {
      setIsLoading(false);
    }
  }, [feedback]);

  useEffect(() => {
    loadUserProfile();
  }, [loadUserProfile]);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      const data = await listDevices();
      setDevices(data.devices);
      setDeviceLimit(data.limit);
      setCurrentDeviceId(data.current_device_id);
    } catch (err) {
      console.error('Failed to load devices:', err);
      feedback.showError('Failed to load devices', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDevicesLoading(false);
    }
  }, [feedback]);

  useEffect(() => {
    if (activeTab === 'devices') {
      loadDevices();
    }
  }, [activeTab, loadDevices]);

  const handleRemoveDevice = async (rowId: string) => {
    setRemovingDeviceId(rowId);
    try {
      await removeDevice(rowId);
      feedback.showSuccess('Device removed', 'The device has been removed from your account');
      await loadDevices();
    } catch (err) {
      feedback.showError('Remove failed', err instanceof Error ? err.message : 'Failed to remove device');
    } finally {
      setRemovingDeviceId(null);
    }
  };

  const handleUpdateProfile = async () => {
    if (!userProfile) return;

    setIsUpdating(true);
    try {
      await updateUserProfile({
        display_name: displayName,
        full_name: fullName,
        date_of_birth: dateOfBirth || undefined,
        phone: phone || undefined,
        bio: bio
      });

      feedback.showSuccess('Profile updated', 'Your profile information has been saved successfully');
      // Send profile updated notification (non-blocking)
      const changes: { field: string; newValue: string }[] = [];
      if (displayName !== userProfile.display_name) changes.push({ field: 'Display Name', newValue: displayName });
      if (fullName !== (userProfile as any).full_name) changes.push({ field: 'Full Name', newValue: fullName || '(cleared)' });
      if (bio !== (userProfile as any).bio) changes.push({ field: 'Bio', newValue: bio || '(cleared)' });
      if (changes.length > 0) sendProfileUpdatedEmail(changes).catch(() => {});
      await loadUserProfile();
    } catch (error) {
      feedback.showError('Update failed', error instanceof Error ? error.message : 'Failed to update profile');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      feedback.showError('Missing information', 'Please fill in all password fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      feedback.showError('Passwords don\'t match', 'New password and confirmation must match');
      return;
    }

    if (newPassword.length < 6) {
      feedback.showError('Password too short', 'Password must be at least 6 characters long');
      return;
    }

    setIsUpdating(true);
    try {
      await changePassword(newPassword);
      feedback.showSuccess('Password changed', 'Your password has been updated successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      // Send password changed notification email (non-blocking)
      sendPasswordChangedEmail().catch(() => {});
    } catch (error) {
      feedback.showError('Password change failed', error instanceof Error ? error.message : 'Failed to change password');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdatePreferences = async () => {
    setIsUpdating(true);
    try {
      // Track which preferences changed for notification email
      const profile = await getUserProfile();
      const prefChanges: { setting: string; oldValue: string; newValue: string }[] = [];
      const check = (name: string, oldVal: boolean | undefined, newVal: boolean) => {
        if (oldVal !== newVal) prefChanges.push({ setting: name, oldValue: oldVal ? 'On' : 'Off', newValue: newVal ? 'On' : 'Off' });
      };
      if (profile) {
        check('Security Alerts', profile.security_alerts, securityAlerts);
        check('Billing Alerts', profile.billing_alerts, billingAlerts);
        check('Document Alerts', profile.document_alerts, documentAlerts);
        check('Engagement Digests', profile.engagement_digests, engagementDigests);
        check('Life Event Alerts', profile.life_event_alerts, lifeEventAlerts);
        check('Activity Alerts', profile.activity_alerts, activityAlerts);
      }

      await updateUserProfile({
        security_alerts: securityAlerts,
        billing_alerts: billingAlerts,
        document_alerts: documentAlerts,
        engagement_digests: engagementDigests,
        life_event_alerts: lifeEventAlerts,
        activity_alerts: activityAlerts,
      });

      feedback.showSuccess('Preferences saved', 'Your notification preferences have been updated');
      // Send preferences updated notification (non-blocking)
      if (prefChanges.length > 0) sendPreferencesUpdatedEmail(prefChanges).catch(() => {});
      await loadUserProfile();
    } catch (error) {
      feedback.showError('Update failed', error instanceof Error ? error.message : 'Failed to update preferences');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteAccount = async () => {
    const userInput = prompt(
      'This will permanently delete your account and all data. Type "DELETE" to confirm:'
    );

    if (userInput !== 'DELETE') {
      feedback.showError('Deletion cancelled', 'Account deletion was cancelled');
      return;
    }

    setIsUpdating(true);
    try {
      const { data: documents } = await supabase
        .from('documents')
        .select('id')
        .eq('user_id', userProfile!.id);

      if (documents && documents.length > 0) {
        await supabase
          .from('document_chunks')
          .delete()
          .eq('user_id', userProfile!.id);

        await supabase
          .from('documents')
          .delete()
          .eq('user_id', userProfile!.id);
      }

      const { data: files } = await supabase.storage
        .from('documents')
        .list(userProfile!.id);

      if (files && files.length > 0) {
        const filePaths = files.map(file => `${userProfile!.id}/${file.name}`);
        await supabase.storage
          .from('documents')
          .remove(filePaths);
      }

      // Send account deletion confirmation email (before sign out)
      if (userProfile?.email) {
        sendAccountDeletedEmail(
          userProfile.email,
          displayName || '',
          documents?.length || 0
        ).catch(() => {});
      }

      feedback.showSuccess('Account deleted', 'Your account and all data have been permanently deleted');
      await supabase.auth.signOut();
    } catch (error) {
      feedback.showError('Delete failed', error instanceof Error ? error.message : 'Failed to delete account');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 sm:px-8 py-6 sm:py-8 shadow-lg">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2">Account Settings</h1>
          <p className="text-emerald-100 text-sm sm:text-base">Manage your profile, security, and preferences</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 bg-white px-3 sm:px-8 py-3 sm:py-6">
        <nav className="flex justify-center gap-1 sm:gap-2 max-w-4xl mx-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 sm:gap-2 px-2 sm:px-6 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === id
                  ? 'bg-gradient-to-br from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-200'
                  : 'bg-gray-50 text-gray-600 hover:text-gray-900 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-emerald-600 border-t-transparent"></div>
          </div>
        ) : (
          <div className="p-3 sm:p-8 max-w-6xl mx-auto">
            {/* Profile Tab */}
            {activeTab === 'profile' && (
              <div className="space-y-6">
                {/* User Info Card */}
                <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-xl overflow-hidden">
                  <div className="bg-gradient-to-br from-emerald-600 to-teal-600 px-4 sm:px-8 py-4 sm:py-6">
                    <div className="flex items-center gap-3 sm:gap-4">
                      <div className="bg-white/20 backdrop-blur-sm rounded-xl sm:rounded-2xl p-3 sm:p-4 flex-shrink-0">
                        <User className="h-8 w-8 sm:h-12 sm:w-12 text-white" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-xl sm:text-2xl font-bold text-white truncate">{displayName || 'User'}</h2>
                        <p className="text-emerald-100 text-sm sm:text-base truncate">{userProfile?.email}</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 sm:p-8">
                    <div className="grid md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8">
                      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-xl p-5 border border-blue-100">
                        <div className="flex items-center gap-3 mb-2">
                          <Calendar className="h-5 w-5 text-blue-600" />
                          <p className="text-sm font-semibold text-blue-900">Member Since</p>
                        </div>
                        <p className="text-xl font-bold text-blue-900">
                          {formatUTCDate(userProfile?.created_at || '')}
                        </p>
                      </div>

                      {userProfile?.last_sign_in_at && (
                        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-5 border border-purple-100">
                          <div className="flex items-center gap-3 mb-2">
                            <Shield className="h-5 w-5 text-purple-600" />
                            <p className="text-sm font-semibold text-purple-900">Last Login</p>
                          </div>
                          <p className="text-xl font-bold text-purple-900">
                            {formatUTCDate(userProfile.last_sign_in_at)}
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          Display Name
                        </label>
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          placeholder="Enter your display name"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          Full Name
                        </label>
                        <input
                          type="text"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Enter your full name"
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                        />
                      </div>

                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-3">
                            Date of Birth
                          </label>
                          <input
                            type="date"
                            value={dateOfBirth}
                            onChange={(e) => setDateOfBirth(e.target.value)}
                            max={new Date().toISOString().split('T')[0]}
                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-semibold text-gray-700 mb-3">
                            Phone Number
                          </label>
                          <PhoneInput
                            value={phone}
                            onChange={setPhone}
                            placeholder="Enter your phone number"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          Email Address
                        </label>
                        <div className="flex items-center gap-3">
                          <input
                            type="email"
                            value={userProfile?.email || ''}
                            disabled
                            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl bg-gray-50 text-gray-500"
                          />
                          {userProfile?.email_confirmed_at ? (
                            <div className="bg-green-100 p-2 rounded-lg">
                              <CheckCircle className="h-6 w-6 text-green-600" title="Email verified" />
                            </div>
                          ) : (
                            <div className="bg-orange-100 p-2 rounded-lg">
                              <AlertCircle className="h-6 w-6 text-orange-600" title="Email not verified" />
                            </div>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-2 ml-1">
                          Email changes require verification and are not currently supported
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          Bio
                        </label>
                        <textarea
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          placeholder="Tell us about yourself..."
                          rows={4}
                          className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all resize-none"
                        />
                      </div>
                    </div>

                    <button
                      onClick={handleUpdateProfile}
                      disabled={isUpdating}
                      className="mt-8 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-300 text-white px-6 py-2.5 rounded-lg font-medium transition-all shadow-md hover:shadow-lg disabled:shadow-none inline-flex items-center gap-2"
                    >
                      {isUpdating ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                          <span>Saving...</span>
                        </>
                      ) : (
                        <span>Save Changes</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
              <div className="space-y-6">
                {/* Change Password Card */}
                <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-xl overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 sm:px-8 py-4 sm:py-5">
                    <div className="flex items-center gap-3">
                      <Lock className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                      <h3 className="text-lg sm:text-xl font-bold text-white">Change Password</h3>
                    </div>
                  </div>

                  <div className="p-4 sm:p-8">
                    <div className="space-y-6">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          Current Password
                        </label>
                        <div className="relative">
                          <input
                            type={showCurrentPassword ? 'text' : 'password'}
                            value={currentPassword}
                            onChange={(e) => setCurrentPassword(e.target.value)}
                            className="w-full px-4 py-3 pr-12 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                            className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showCurrentPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          New Password
                        </label>
                        <div className="relative">
                          <input
                            type={showNewPassword ? 'text' : 'password'}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            className="w-full px-4 py-3 pr-12 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                          Confirm New Password
                        </label>
                        <div className="relative">
                          <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className="w-full px-4 py-3 pr-12 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                          >
                            {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-3 mt-6">
                      <button
                        onClick={handleChangePassword}
                        disabled={isUpdating}
                        className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-300 text-white px-6 py-2.5 rounded-lg font-medium transition-all shadow-md hover:shadow-lg disabled:shadow-none inline-flex items-center gap-2"
                      >
                        {isUpdating ? (
                          <>
                            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                            <span>Changing...</span>
                          </>
                        ) : (
                          <span>Change Password</span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="bg-white rounded-2xl border-2 border-red-300 shadow-xl overflow-hidden">
                  <div className="bg-gradient-to-r from-red-600 to-red-700 px-4 sm:px-8 py-4 sm:py-5">
                    <div className="flex items-center gap-3">
                      <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                      <h3 className="text-lg sm:text-xl font-bold text-white">Danger Zone</h3>
                    </div>
                  </div>

                  <div className="p-4 sm:p-8">
                    <div className="bg-red-50 border-2 border-red-200 rounded-xl p-6">
                      <div className="flex items-start gap-4">
                        <div className="bg-red-100 p-3 rounded-xl">
                          <Trash2 className="h-6 w-6 text-red-600" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-lg font-bold text-red-900 mb-2">Delete Account</h4>
                          <p className="text-red-800 mb-6">
                            Permanently delete your account and all associated data. This action cannot be undone.
                          </p>
                          <button
                            onClick={handleDeleteAccount}
                            disabled={isUpdating}
                            className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-5 py-2 rounded-lg font-medium transition-all shadow-md hover:shadow-lg text-sm"
                          >
                            Delete Account Permanently
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Preferences Tab */}
            {activeTab === 'preferences' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-xl overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 sm:px-8 py-4 sm:py-5">
                    <div className="flex items-center gap-3">
                      <Bell className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                      <div>
                        <h3 className="text-lg sm:text-xl font-bold text-white">Notification Preferences</h3>
                        <p className="text-emerald-100 text-xs sm:text-sm">Choose which emails you receive</p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 sm:p-8 space-y-6 sm:space-y-8">
                    {/* Security & Account */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Shield className="h-4 w-4 text-red-500" />
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Security & Account</h4>
                      </div>
                      <div className="flex items-center justify-between p-3 sm:p-5 bg-gradient-to-br from-red-50 to-white border-2 border-red-100 rounded-xl">
                        <div className="flex items-start gap-3 sm:gap-4">
                          <div className="bg-red-100 p-2 sm:p-2.5 rounded-xl hidden sm:block">
                            <Shield className="h-5 w-5 text-red-600" />
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900 mb-0.5">Security Alerts</h4>
                            <p className="text-xs text-gray-500">Password changes, new device logins, suspicious activity</p>
                            <p className="text-xs text-red-500 font-medium mt-1">Critical emails (welcome, password, account deletion) are always sent</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                          <input type="checkbox" checked={securityAlerts} onChange={(e) => setSecurityAlerts(e.target.checked)} className="sr-only peer" />
                          <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                      </div>
                    </div>

                    {/* Billing & Subscription */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <CreditCard className="h-4 w-4 text-blue-500" />
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Billing & Subscription</h4>
                      </div>
                      <div className="flex items-center justify-between p-3 sm:p-5 bg-gradient-to-br from-blue-50 to-white border-2 border-blue-100 rounded-xl">
                        <div className="flex items-start gap-3 sm:gap-4">
                          <div className="bg-blue-100 p-2 sm:p-2.5 rounded-xl hidden sm:block">
                            <CreditCard className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900 mb-0.5">Billing Alerts</h4>
                            <p className="text-xs text-gray-500">Payment receipts, subscription changes, plan expiration, usage limits</p>
                            <p className="text-xs text-blue-500 font-medium mt-1">Payment failures and confirmations are always sent</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                          <input type="checkbox" checked={billingAlerts} onChange={(e) => setBillingAlerts(e.target.checked)} className="sr-only peer" />
                          <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                      </div>
                    </div>

                    {/* Document Alerts */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <FileText className="h-4 w-4 text-emerald-500" />
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Document Alerts</h4>
                      </div>
                      <div className="flex items-center justify-between p-3 sm:p-5 bg-gradient-to-br from-emerald-50 to-white border-2 border-emerald-100 rounded-xl">
                        <div className="flex items-start gap-3 sm:gap-4">
                          <div className="bg-emerald-100 p-2 sm:p-2.5 rounded-xl hidden sm:block">
                            <FileText className="h-5 w-5 text-emerald-600" />
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900 mb-0.5">Document Alerts</h4>
                            <p className="text-xs text-gray-500">Upload confirmations, processing status, expirations, deletions, health warnings, review reminders</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                          <input type="checkbox" checked={documentAlerts} onChange={(e) => setDocumentAlerts(e.target.checked)} className="sr-only peer" />
                          <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                      </div>
                    </div>

                    {/* Engagement Digests */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart3 className="h-4 w-4 text-purple-500" />
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Engagement Digests</h4>
                      </div>
                      <div className="flex items-center justify-between p-3 sm:p-5 bg-gradient-to-br from-purple-50 to-white border-2 border-purple-100 rounded-xl">
                        <div className="flex items-start gap-3 sm:gap-4">
                          <div className="bg-purple-100 p-2 sm:p-2.5 rounded-xl hidden sm:block">
                            <BarChart3 className="h-5 w-5 text-purple-600" />
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900 mb-0.5">Engagement Digests</h4>
                            <p className="text-xs text-gray-500">Daily summaries, weekly audits, monthly reports, gap suggestions, preparedness score changes</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                          <input type="checkbox" checked={engagementDigests} onChange={(e) => setEngagementDigests(e.target.checked)} className="sr-only peer" />
                          <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                      </div>
                    </div>

                    {/* Life Events */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Compass className="h-4 w-4 text-amber-500" />
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Life Events</h4>
                      </div>
                      <div className="flex items-center justify-between p-3 sm:p-5 bg-gradient-to-br from-amber-50 to-white border-2 border-amber-100 rounded-xl">
                        <div className="flex items-start gap-3 sm:gap-4">
                          <div className="bg-amber-100 p-2 sm:p-2.5 rounded-xl hidden sm:block">
                            <Compass className="h-5 w-5 text-amber-600" />
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900 mb-0.5">Life Event Alerts</h4>
                            <p className="text-xs text-gray-500">Event creation, readiness changes, missing requirements, completion, archival</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                          <input type="checkbox" checked={lifeEventAlerts} onChange={(e) => setLifeEventAlerts(e.target.checked)} className="sr-only peer" />
                          <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                      </div>
                    </div>

                    {/* Activity */}
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <Activity className="h-4 w-4 text-gray-500" />
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Activity</h4>
                      </div>
                      <div className="flex items-center justify-between p-3 sm:p-5 bg-gradient-to-br from-gray-50 to-white border-2 border-gray-200 rounded-xl">
                        <div className="flex items-start gap-3 sm:gap-4">
                          <div className="bg-gray-100 p-2 sm:p-2.5 rounded-xl hidden sm:block">
                            <Activity className="h-5 w-5 text-gray-600" />
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900 mb-0.5">Activity Alerts</h4>
                            <p className="text-xs text-gray-500">Profile updates, preference changes, document metadata modifications</p>
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                          <input type="checkbox" checked={activityAlerts} onChange={(e) => setActivityAlerts(e.target.checked)} className="sr-only peer" />
                          <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                        </label>
                      </div>
                    </div>

                    <button
                      onClick={handleUpdatePreferences}
                      disabled={isUpdating}
                      className="mt-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-300 text-white px-6 py-2.5 rounded-lg font-medium transition-all shadow-md hover:shadow-lg disabled:shadow-none inline-flex items-center gap-2"
                    >
                      {isUpdating ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                          <span>Saving...</span>
                        </>
                      ) : (
                        <span>Save Preferences</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Devices Tab */}
            {activeTab === 'devices' && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-xl overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-4 sm:px-8 py-4 sm:py-5">
                    <div className="flex items-center gap-3">
                      <Smartphone className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
                      <div>
                        <h3 className="text-lg sm:text-xl font-bold text-white">Connected Devices</h3>
                        <p className="text-emerald-100 text-xs sm:text-sm">
                          Using {devices.filter(d => !d.is_blocked).length} of {deviceLimit} device{deviceLimit !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 sm:p-8">
                    {devicesLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-8 w-8 text-emerald-600 animate-spin" />
                      </div>
                    ) : devices.length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <Smartphone className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                        <p className="font-medium">No devices registered yet</p>
                        <p className="text-sm mt-1">Devices are registered automatically when you use the app</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {devices.map((device) => {
                          const isCurrent = device.device_id === (currentDeviceId || getDeviceId());
                          return (
                            <div key={device.id} className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                              <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                <div className={`p-2.5 rounded-xl shrink-0 ${
                                  device.is_blocked ? 'bg-red-50' : isCurrent ? 'bg-emerald-50' : 'bg-gray-50'
                                }`}>
                                  {device.platform.includes('ios') || device.platform === 'mobile' ? (
                                    <Smartphone className={`h-5 w-5 ${device.is_blocked ? 'text-red-500' : isCurrent ? 'text-emerald-600' : 'text-gray-500'}`} />
                                  ) : device.platform.includes('android') ? (
                                    <Tablet className={`h-5 w-5 ${device.is_blocked ? 'text-red-500' : isCurrent ? 'text-emerald-600' : 'text-gray-500'}`} />
                                  ) : (
                                    <Monitor className={`h-5 w-5 ${device.is_blocked ? 'text-red-500' : isCurrent ? 'text-emerald-600' : 'text-gray-500'}`} />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="font-semibold text-gray-900 text-sm sm:text-base truncate">
                                      {device.device_name || 'Unknown device'}
                                    </p>
                                    {isCurrent && (
                                      <span className="text-[10px] sm:text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                                        This device
                                      </span>
                                    )}
                                    {device.is_blocked && (
                                      <span className="text-[10px] sm:text-xs font-semibold text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full whitespace-nowrap">
                                        Blocked
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-gray-500 mt-0.5">
                                    Last active {formatRelativeTime(device.last_active_at)}
                                  </p>
                                </div>
                              </div>
                              {!isCurrent && (
                                <button
                                  onClick={() => handleRemoveDevice(device.id)}
                                  disabled={removingDeviceId === device.id}
                                  className="ml-3 shrink-0 text-red-500 hover:text-red-700 hover:bg-red-50 p-2 rounded-lg transition-colors disabled:opacity-50"
                                  title="Remove device"
                                >
                                  {removingDeviceId === device.id ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <X className="h-4 w-4" />
                                  )}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Info card */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                    <div className="text-sm text-blue-800">
                      <p className="font-semibold mb-1">About device limits</p>
                      <p>Your <span className="font-medium capitalize">{devices.length > 0 ? '' : 'current '}</span>plan supports up to {deviceLimit} device{deviceLimit !== 1 ? 's' : ''}. Devices inactive for 30 days are automatically removed. If you reach your limit, the least recently used device will be blocked.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Billing Tab */}
            {activeTab === 'billing' && <BillingPage onSubscriptionChange={onSubscriptionChange} />}
          </div>
        )}
      </div>
    </div>
  );
}
