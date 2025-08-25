import React, { useState, useEffect } from 'react';
import { X, User, Mail, Lock, Shield, Calendar, Settings, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase, getCurrentUser, updateUserProfile, changePassword, resetPassword, getUserProfile, UserProfile } from '../lib/supabase';
import { useFeedback } from '../hooks/useFeedback';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UserProfile {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at?: string;
  email_confirmed_at?: string;
  display_name?: string;
  bio?: string;
}

type TabType = 'profile' | 'security' | 'preferences';

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('profile');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const feedback = useFeedback();

  // Profile form state
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');

  // Security form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Preferences state
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [documentReminders, setDocumentReminders] = useState(true);
  const [securityAlerts, setSecurityAlerts] = useState(true);

  const tabs = [
    { id: 'profile' as TabType, label: 'Profile', icon: User },
    { id: 'security' as TabType, label: 'Security', icon: Lock },
    { id: 'preferences' as TabType, label: 'Preferences', icon: Settings }
  ];

  useEffect(() => {
    if (isOpen) {
      loadUserProfile();
    }
  }, [isOpen]);

  const loadUserProfile = async () => {
    try {
      setIsLoading(true);
      const user = await getCurrentUser();
      if (user) {
        // Get basic auth user info
        setUserProfile({
          id: user.id,
          email: user.email || '',
          created_at: user.created_at || '',
          last_sign_in_at: user.last_sign_in_at,
          email_confirmed_at: user.email_confirmed_at,
          display_name: user.user_metadata?.display_name || '',
          bio: user.user_metadata?.bio || ''
        });

        // Get extended profile data
        const profile = await getUserProfile();
        if (profile) {
          setDisplayName(profile.display_name || '');
          setBio(profile.bio || '');
          setEmailNotifications(profile.email_notifications);
          setDocumentReminders(profile.document_reminders);
          setSecurityAlerts(profile.security_alerts);
        } else {
          // Set defaults if no profile exists yet
          setDisplayName(user.user_metadata?.display_name || '');
          setBio(user.user_metadata?.bio || '');
          setEmailNotifications(true);
          setDocumentReminders(true);
          setSecurityAlerts(true);
        }
      }
    } catch (error) {
      feedback.showError('Failed to load profile', 'Unable to fetch your profile information');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!userProfile) return;

    setIsUpdating(true);
    try {
      await updateUserProfile({
        display_name: displayName,
        bio: bio
      });

      feedback.showSuccess('Profile updated', 'Your profile information has been saved successfully');
      
      // Reload profile to get updated data
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
    } catch (error) {
      feedback.showError('Password change failed', error instanceof Error ? error.message : 'Failed to change password');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleResetPassword = async () => {
    if (!userProfile?.email) return;

    setIsUpdating(true);
    try {
      await resetPassword(userProfile.email);

      feedback.showSuccess('Reset email sent', 'Check your email for password reset instructions');
    } catch (error) {
      feedback.showError('Reset failed', error instanceof Error ? error.message : 'Failed to send reset email');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdatePreferences = async () => {
    setIsUpdating(true);
    try {
      await updateUserProfile({
        email_notifications: emailNotifications,
        document_reminders: documentReminders,
        security_alerts: securityAlerts
      });

      feedback.showSuccess('Preferences saved', 'Your notification preferences have been updated');
      
      // Reload profile to confirm changes
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
      // First delete all user documents and chunks
      const { data: documents } = await supabase
        .from('documents')
        .select('id')
        .eq('user_id', userProfile.id);

      if (documents && documents.length > 0) {
        // Delete document chunks first (due to foreign key constraints)
        await supabase
          .from('document_chunks')
          .delete()
          .eq('user_id', userProfile.id);

        // Delete documents
        await supabase
          .from('documents')
          .delete()
          .eq('user_id', userProfile.id);
      }

      // Delete user files from storage
      const { data: files } = await supabase.storage
        .from('documents')
        .list(userProfile.id);

      if (files && files.length > 0) {
        const filePaths = files.map(file => `${userProfile.id}/${file.name}`);
        await supabase.storage
          .from('documents')
          .remove(filePaths);
      }

      feedback.showSuccess('Account deleted', 'Your account and all data have been permanently deleted');
      
      // Sign out the user
      await supabase.auth.signOut();
    } catch (error) {
      feedback.showError('Delete failed', error instanceof Error ? error.message : 'Failed to delete account');
    } finally {
      setIsUpdating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-gray-900">Account Settings</h2>
          <button
            onClick={onClose}
            disabled={isUpdating}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar */}
          <div className="w-64 bg-gray-50 border-r border-gray-200 p-6">
            <nav className="space-y-2">
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                    activeTab === id
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{label}</span>
                </button>
              ))}
            </nav>

            {/* User Info */}
            {userProfile && (
              <div className="mt-8 p-4 bg-white rounded-lg border border-gray-200">
                <div className="flex items-center space-x-3 mb-3">
                  <div className="bg-blue-100 w-10 h-10 rounded-full flex items-center justify-center">
                    <User className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{displayName || 'User'}</p>
                    <p className="text-sm text-gray-500">{userProfile.email}</p>
                  </div>
                </div>
                <div className="text-xs text-gray-500">
                  <p>Member since {new Date(userProfile.created_at).toLocaleDateString()}</p>
                  {userProfile.last_sign_in_at && (
                    <p>Last login {new Date(userProfile.last_sign_in_at).toLocaleDateString()}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-600 border-t-transparent"></div>
              </div>
            ) : (
              <>
                {/* Profile Tab */}
                {activeTab === 'profile' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Profile Information</h3>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Display Name
                          </label>
                          <input
                            type="text"
                            value={displayName}
                            onChange={(e) => setDisplayName(e.target.value)}
                            placeholder="Enter your display name"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Email Address
                          </label>
                          <div className="flex items-center space-x-2">
                            <input
                              type="email"
                              value={userProfile?.email || ''}
                              disabled
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                            />
                            {userProfile?.email_confirmed_at ? (
                              <CheckCircle className="h-5 w-5 text-green-600" title="Email verified" />
                            ) : (
                              <AlertCircle className="h-5 w-5 text-orange-600" title="Email not verified" />
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-1">
                            Email changes require verification and are not currently supported
                          </p>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Bio
                          </label>
                          <textarea
                            value={bio}
                            onChange={(e) => setBio(e.target.value)}
                            placeholder="Tell us about yourself..."
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>

                      <button
                        onClick={handleUpdateProfile}
                        disabled={isUpdating}
                        className="mt-6 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
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
                )}

                {/* Security Tab */}
                {activeTab === 'security' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h3>
                      
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Current Password
                          </label>
                          <div className="relative">
                            <input
                              type={showCurrentPassword ? 'text' : 'password'}
                              value={currentPassword}
                              onChange={(e) => setCurrentPassword(e.target.value)}
                              className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            New Password
                          </label>
                          <div className="relative">
                            <input
                              type={showNewPassword ? 'text' : 'password'}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => setShowNewPassword(!showNewPassword)}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Confirm New Password
                          </label>
                          <div className="relative">
                            <input
                              type={showConfirmPassword ? 'text' : 'password'}
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                              className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                            >
                              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex space-x-4 mt-6">
                        <button
                          onClick={handleChangePassword}
                          disabled={isUpdating}
                          className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
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

                        <button
                          onClick={handleResetPassword}
                          disabled={isUpdating}
                          className="bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                        >
                          Send Reset Email
                        </button>
                      </div>
                    </div>

                    {/* Danger Zone */}
                    <div className="border-t border-gray-200 pt-6">
                      <h3 className="text-lg font-semibold text-red-600 mb-4">Danger Zone</h3>
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <h4 className="font-medium text-red-800 mb-2">Delete Account</h4>
                        <p className="text-sm text-red-700 mb-4">
                          Permanently delete your account and all associated data. This action cannot be undone.
                        </p>
                        <button
                          onClick={handleDeleteAccount}
                          disabled={isUpdating}
                          className="bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                        >
                          Delete Account
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Preferences Tab */}
                {activeTab === 'preferences' && (
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-4">Notification Preferences</h3>
                      
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900">Email Notifications</h4>
                            <p className="text-sm text-gray-500">Receive general updates and announcements</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={emailNotifications}
                              onChange={(e) => setEmailNotifications(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900">Document Reminders</h4>
                            <p className="text-sm text-gray-500">Get notified about expiring documents</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={documentReminders}
                              onChange={(e) => setDocumentReminders(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-gray-900">Security Alerts</h4>
                            <p className="text-sm text-gray-500">Important security and login notifications</p>
                          </div>
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={securityAlerts}
                              onChange={(e) => setSecurityAlerts(e.target.checked)}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                          </label>
                        </div>
                      </div>

                      <button
                        onClick={handleUpdatePreferences}
                        disabled={isUpdating}
                        className="mt-6 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2"
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
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}