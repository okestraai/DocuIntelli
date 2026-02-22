import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  User,
  Mail,
  FileText,
  Calendar,
  Clock,
  CheckCircle,
} from 'lucide-react-native';
import { useAuthStore } from '../../src/store/authStore';
import { getUserProfile, updateUserProfile } from '../../src/lib/supabase';
import Card from '../../src/components/ui/Card';
import Button from '../../src/components/ui/Button';
import Input from '../../src/components/ui/Input';
import PhoneInputMobile from '../../src/components/ui/PhoneInput';
import GradientIcon from '../../src/components/ui/GradientIcon';
import LoadingSpinner from '../../src/components/ui/LoadingSpinner';
import Toast from '../../src/components/ui/Toast';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { spacing, borderRadius } from '../../src/theme/spacing';

export default function ProfileScreen() {
  const { user } = useAuthStore();

  const [displayName, setDisplayName] = useState('');
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error'; visible: boolean }>({
    message: '',
    type: 'success',
    visible: false,
  });

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      const profile = await getUserProfile();
      if (profile) {
        setDisplayName(profile.display_name || '');
        setFullName(profile.full_name || '');
        setDateOfBirth(profile.date_of_birth || '');
        setPhone(profile.phone || '');
        setBio(profile.bio || '');
      } else {
        // Fall back to auth metadata
        setDisplayName(user?.user_metadata?.display_name || '');
        setFullName(user?.user_metadata?.full_name || '');
        setPhone(user?.user_metadata?.phone || '');
      }
    } catch {
      setToast({ message: 'Failed to load profile', type: 'error', visible: true });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadProfile();
    setRefreshing(false);
  }, [loadProfile]);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateUserProfile({
        display_name: displayName.trim(),
        full_name: fullName.trim(),
        date_of_birth: dateOfBirth.trim(),
        phone: phone.trim(),
        bio: bio.trim(),
      });
      setToast({ message: 'Profile updated successfully', type: 'success', visible: true });
    } catch {
      setToast({ message: 'Failed to update profile', type: 'error', visible: true });
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const isEmailConfirmed = !!user?.email_confirmed_at;

  if (loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[colors.primary[500]]}
            tintColor={colors.primary[500]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <GradientIcon size={44}>
            <User size={22} color={colors.white} strokeWidth={1.8} />
          </GradientIcon>
          <View>
            <Text style={styles.pageTitle}>Edit Profile</Text>
            <Text style={styles.pageSubtitle}>Update your personal information</Text>
          </View>
        </View>

        {/* Info cards row */}
        <View style={styles.infoRow}>
          <Card style={styles.infoCard}>
            <View style={[styles.infoIconWrap, { backgroundColor: colors.info[50] }]}>
              <Calendar size={18} color={colors.info[600]} strokeWidth={1.8} />
            </View>
            <Text style={styles.infoLabel}>Member Since</Text>
            <Text style={styles.infoValue}>{formatDate(user?.created_at)}</Text>
          </Card>

          <Card style={styles.infoCard}>
            <View style={[styles.infoIconWrap, { backgroundColor: colors.primary[50] }]}>
              <Clock size={18} color={colors.primary[600]} strokeWidth={1.8} />
            </View>
            <Text style={styles.infoLabel}>Last Login</Text>
            <Text style={styles.infoValue}>{formatDate(user?.last_sign_in_at)}</Text>
          </Card>
        </View>

        {/* Form */}
        <Card>
          <View style={styles.formSection}>
            <Input
              label="Display Name"
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="Enter your name"
              icon={<User size={18} color={colors.slate[400]} strokeWidth={1.8} />}
              autoCapitalize="words"
            />

            <Input
              label="Full Name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Enter your full name"
              icon={<User size={18} color={colors.slate[400]} strokeWidth={1.8} />}
              autoCapitalize="words"
            />

            <View style={styles.twoCol}>
              <View style={styles.colHalf}>
                <Input
                  label="Date of Birth"
                  value={dateOfBirth}
                  onChangeText={setDateOfBirth}
                  placeholder="YYYY-MM-DD"
                  icon={<Calendar size={18} color={colors.slate[400]} strokeWidth={1.8} />}
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View style={styles.colHalf}>
                <PhoneInputMobile
                  label="Phone Number"
                  value={phone}
                  onChange={setPhone}
                />
              </View>
            </View>

            <View>
              <Input
                label="Email"
                value={user?.email || ''}
                editable={false}
                placeholder="Email address"
                icon={<Mail size={18} color={colors.slate[400]} strokeWidth={1.8} />}
                rightIcon={
                  isEmailConfirmed ? (
                    <CheckCircle size={18} color={colors.success[500]} strokeWidth={1.8} />
                  ) : undefined
                }
              />
              {isEmailConfirmed && (
                <Text style={styles.verifiedText}>Email verified</Text>
              )}
            </View>

            <Input
              label="Bio"
              value={bio}
              onChangeText={setBio}
              placeholder="Tell us about yourself"
              icon={<FileText size={18} color={colors.slate[400]} strokeWidth={1.8} />}
              multiline
              numberOfLines={4}
              style={styles.bioInput}
              textAlignVertical="top"
            />
          </View>
        </Card>

        {/* Save button */}
        <Button
          title="Save Changes"
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          fullWidth
        />
      </ScrollView>

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

  // Info cards
  infoRow: { flexDirection: 'row', gap: spacing.md },
  infoCard: { flex: 1, alignItems: 'center' as const },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.lg,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    marginBottom: spacing.sm,
  },
  infoLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    marginBottom: 2,
  },
  infoValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },

  // Form
  formSection: { gap: spacing.lg },
  twoCol: { flexDirection: 'row' as const, gap: spacing.md },
  colHalf: { flex: 1 },
  verifiedText: {
    fontSize: typography.fontSize.xs,
    color: colors.success[600],
    marginTop: 4,
    marginLeft: 4,
  },
  bioInput: {
    minHeight: 100,
  },
});
