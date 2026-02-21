import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  Shield,
  Eye,
  EyeOff,
  AlertTriangle,
  Trash2,
} from 'lucide-react-native';
import { useAuthStore } from '../../src/store/authStore';
import { useBiometrics } from '../../src/hooks/useBiometrics';
import {
  supabase,
  changePassword,
} from '../../src/lib/supabase';
import Card from '../../src/components/ui/Card';
import Button from '../../src/components/ui/Button';
import Input from '../../src/components/ui/Input';
import GradientIcon from '../../src/components/ui/GradientIcon';
import Modal from '../../src/components/ui/Modal';
import Toast from '../../src/components/ui/Toast';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { spacing, borderRadius } from '../../src/theme/spacing';

export default function SecurityScreen() {
  const { user, signOut } = useAuthStore();
  const { available, enabled, biometricType, toggleBiometric } = useBiometrics();

  // Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  // Delete account
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false,
  });

  const passwordErrors = {
    newPassword: newPassword.length > 0 && newPassword.length < 6 ? 'Must be at least 6 characters' : undefined,
    confirmPassword:
      confirmPassword.length > 0 && confirmPassword !== newPassword
        ? 'Passwords do not match'
        : undefined,
  };

  const canChangePassword =
    currentPassword.length > 0 &&
    newPassword.length >= 6 &&
    confirmPassword === newPassword;

  const handleChangePassword = async () => {
    if (!canChangePassword) return;
    try {
      setChangingPassword(true);
      // Re-authenticate with current password first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword,
      });
      if (signInError) {
        setToast({ message: 'Current password is incorrect', type: 'error', visible: true });
        return;
      }
      await changePassword(newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setToast({ message: 'Password changed successfully', type: 'success', visible: true });
    } catch {
      setToast({ message: 'Failed to change password', type: 'error', visible: true });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      setDeleting(true);
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) throw new Error('Not authenticated');

      // Delete document chunks
      await supabase.from('document_chunks').delete().eq('user_id', currentUser.id);

      // Get document file paths
      const { data: docs } = await supabase
        .from('documents')
        .select('file_path')
        .eq('user_id', currentUser.id);

      // Delete storage files
      if (docs?.length) {
        await supabase.storage
          .from('documents')
          .remove(docs.map((d: { file_path: string }) => d.file_path));
      }

      // Delete documents
      await supabase.from('documents').delete().eq('user_id', currentUser.id);

      // Delete profile
      await supabase.from('user_profiles').delete().eq('id', currentUser.id);

      // Delete subscription
      await supabase.from('user_subscriptions').delete().eq('user_id', currentUser.id);

      // Sign out
      await signOut();
      router.replace('/(auth)/login');
    } catch {
      setToast({ message: 'Failed to delete account', type: 'error', visible: true });
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <GradientIcon size={44}>
            <Shield size={22} color={colors.white} strokeWidth={1.8} />
          </GradientIcon>
          <View>
            <Text style={styles.pageTitle}>Security</Text>
            <Text style={styles.pageSubtitle}>Manage your account security</Text>
          </View>
        </View>

        {/* Change Password */}
        <Card>
          <Text style={styles.sectionTitle}>Change Password</Text>
          <View style={styles.formSection}>
            <Input
              label="Current Password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Enter current password"
              secureTextEntry={!showCurrent}
              rightIcon={
                showCurrent ? (
                  <EyeOff size={18} color={colors.slate[400]} strokeWidth={1.8} />
                ) : (
                  <Eye size={18} color={colors.slate[400]} strokeWidth={1.8} />
                )
              }
              onRightIconPress={() => setShowCurrent(!showCurrent)}
              autoCapitalize="none"
            />

            <Input
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Enter new password"
              secureTextEntry={!showNew}
              error={passwordErrors.newPassword}
              rightIcon={
                showNew ? (
                  <EyeOff size={18} color={colors.slate[400]} strokeWidth={1.8} />
                ) : (
                  <Eye size={18} color={colors.slate[400]} strokeWidth={1.8} />
                )
              }
              onRightIconPress={() => setShowNew(!showNew)}
              autoCapitalize="none"
            />

            <Input
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              secureTextEntry={!showConfirm}
              error={passwordErrors.confirmPassword}
              rightIcon={
                showConfirm ? (
                  <EyeOff size={18} color={colors.slate[400]} strokeWidth={1.8} />
                ) : (
                  <Eye size={18} color={colors.slate[400]} strokeWidth={1.8} />
                )
              }
              onRightIconPress={() => setShowConfirm(!showConfirm)}
              autoCapitalize="none"
            />

            <Button
              title="Change Password"
              onPress={handleChangePassword}
              loading={changingPassword}
              disabled={!canChangePassword || changingPassword}
              fullWidth
            />

          </View>
        </Card>

        {/* Biometric Authentication */}
        {available && (
          <Card>
            <View style={styles.biometricRow}>
              <View style={styles.biometricInfo}>
                <Text style={styles.sectionTitle}>{biometricType} Authentication</Text>
                <Text style={styles.descriptionText}>
                  Use {biometricType.toLowerCase()} to quickly and securely unlock DocuIntelli.
                </Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={toggleBiometric}
                trackColor={{ false: colors.slate[200], true: colors.primary[500] }}
                thumbColor={colors.white}
              />
            </View>
          </Card>
        )}

        {/* Danger Zone */}
        <Card style={{ borderColor: colors.error[200] }}>
          <View style={styles.dangerHeader}>
            <AlertTriangle size={20} color={colors.error[600]} strokeWidth={1.8} />
            <Text style={styles.dangerTitle}>Danger Zone</Text>
          </View>
          <Text style={styles.dangerText}>
            Permanently delete your account and all associated data including documents,
            embeddings, and subscription information. This action cannot be undone.
          </Text>
          <Button
            title="Delete Account"
            onPress={() => setDeleteModalVisible(true)}
            variant="danger"
            icon={<Trash2 size={16} color={colors.white} strokeWidth={1.8} />}
            fullWidth
            style={styles.deleteButton}
          />
        </Card>
      </ScrollView>

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        onClose={() => {
          setDeleteModalVisible(false);
          setDeleteConfirmText('');
        }}
        title="Delete Account"
      >
        <View style={styles.modalContent}>
          <View style={styles.modalWarning}>
            <AlertTriangle size={24} color={colors.error[600]} strokeWidth={1.8} />
            <Text style={styles.modalWarningText}>
              This will permanently delete all your data. This action cannot be reversed.
            </Text>
          </View>

          <Text style={styles.modalLabel}>
            Type <Text style={styles.modalBold}>DELETE</Text> to confirm:
          </Text>
          <TextInput
            style={styles.modalInput}
            value={deleteConfirmText}
            onChangeText={setDeleteConfirmText}
            placeholder="Type DELETE"
            placeholderTextColor={colors.slate[400]}
            autoCapitalize="characters"
          />

          <View style={styles.modalActions}>
            <Button
              title="Cancel"
              onPress={() => {
                setDeleteModalVisible(false);
                setDeleteConfirmText('');
              }}
              variant="outline"
              style={styles.modalButton}
            />
            <Button
              title="Delete Forever"
              onPress={handleDeleteAccount}
              variant="danger"
              loading={deleting}
              disabled={deleteConfirmText !== 'DELETE' || deleting}
              style={styles.modalButton}
            />
          </View>
        </View>
      </Modal>

      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onDismiss={() => setToast((prev) => ({ ...prev, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate[50] },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pageTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  pageSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    marginTop: 2,
  },

  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
    marginBottom: spacing.sm,
  },
  descriptionText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    lineHeight: typography.fontSize.sm * typography.lineHeight.normal,
  },

  // Form
  formSection: { gap: spacing.lg },

  // Biometric
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  biometricInfo: { flex: 1 },

  // Danger zone
  dangerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  dangerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.error[700],
  },
  dangerText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[600],
    lineHeight: typography.fontSize.sm * typography.lineHeight.normal,
    marginBottom: spacing.lg,
  },
  deleteButton: {
    marginTop: spacing.xs,
  },

  // Modal
  modalContent: { gap: spacing.lg },
  modalWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.error[50],
    padding: spacing.md,
    borderRadius: borderRadius.lg,
  },
  modalWarningText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.error[700],
    lineHeight: typography.fontSize.sm * typography.lineHeight.normal,
  },
  modalLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[700],
  },
  modalBold: {
    fontWeight: typography.fontWeight.bold,
    color: colors.error[600],
  },
  modalInput: {
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    borderRadius: borderRadius.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: typography.fontSize.base,
    color: colors.slate[900],
    backgroundColor: colors.white,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  modalButton: { flex: 1 },
});
