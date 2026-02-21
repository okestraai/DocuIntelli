import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { User, Calendar, AlertCircle } from 'lucide-react-native';
import Input from './ui/Input';
import Button from './ui/Button';
import PhoneInputMobile from './ui/PhoneInput';
import { getUserProfile, updateUserProfile } from '../lib/supabase';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';

interface OnboardingModalProps {
  visible: boolean;
  onComplete: () => void;
}

export default function OnboardingModal({ visible, onComplete }: OnboardingModalProps) {
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<{ fullName?: string; dateOfBirth?: string; phone?: string }>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Pre-populate from existing profile data
  useEffect(() => {
    if (visible) {
      getUserProfile().then(profile => {
        if (profile) {
          if (profile.full_name) setFullName(profile.full_name);
          if (profile.date_of_birth) setDateOfBirth(profile.date_of_birth);
          if (profile.phone) setPhone(profile.phone);
        }
      }).catch(() => {});
    }
  }, [visible]);

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!fullName.trim()) {
      newErrors.fullName = 'Full name is required';
    } else if (fullName.trim().length < 2) {
      newErrors.fullName = 'Name must be at least 2 characters';
    }

    if (!dateOfBirth.trim()) {
      newErrors.dateOfBirth = 'Date of birth is required (YYYY-MM-DD)';
    } else {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(dateOfBirth.trim())) {
        newErrors.dateOfBirth = 'Use format YYYY-MM-DD';
      } else {
        const dob = new Date(dateOfBirth.trim());
        if (isNaN(dob.getTime())) {
          newErrors.dateOfBirth = 'Invalid date';
        } else if (dob >= new Date()) {
          newErrors.dateOfBirth = 'Must be in the past';
        }
      }
    }

    if (!phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (phone.replace(/\D/g, '').length < 7) {
      newErrors.phone = 'At least 7 digits required';
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
        date_of_birth: dateOfBirth.trim(),
        phone: phone.trim(),
      });
      onComplete();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save profile';
      setSaveError(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {}} // Block Android back button
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        {/* Backdrop — NOT pressable (non-dismissable), pointerEvents none lets touches reach the form */}
        <View style={styles.backdrop} pointerEvents="none" />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.container}>
            {/* Header */}
            <LinearGradient
              colors={[...colors.gradient.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.header}
            >
              <View style={styles.headerIcon}>
                <User size={24} color={colors.white} />
              </View>
              <Text style={styles.headerTitle}>Complete Your Profile</Text>
              <Text style={styles.headerSubtitle}>We need a few details before you get started</Text>
            </LinearGradient>

            {/* Form */}
            <View style={styles.form}>
              {saveError && (
                <View style={styles.errorBanner}>
                  <AlertCircle size={18} color={colors.error[600]} />
                  <Text style={styles.errorBannerText}>{saveError}</Text>
                </View>
              )}

              <Input
                label="Full Name *"
                value={fullName}
                onChangeText={(text) => { setFullName(text); if (errors.fullName) setErrors(prev => ({ ...prev, fullName: undefined })); }}
                placeholder="Enter your full name"
                error={errors.fullName}
                icon={<User size={18} color={colors.slate[400]} />}
                autoFocus
                autoCapitalize="words"
              />

              <Input
                label="Date of Birth *"
                value={dateOfBirth}
                onChangeText={(text) => { setDateOfBirth(text); if (errors.dateOfBirth) setErrors(prev => ({ ...prev, dateOfBirth: undefined })); }}
                placeholder="YYYY-MM-DD"
                error={errors.dateOfBirth}
                icon={<Calendar size={18} color={colors.slate[400]} />}
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                containerStyle={{ marginTop: spacing.lg }}
              />

              <View style={{ marginTop: spacing.lg }}>
                <PhoneInputMobile
                  label="Phone Number *"
                  value={phone}
                  onChange={(val) => { setPhone(val); if (errors.phone) setErrors(prev => ({ ...prev, phone: undefined })); }}
                  error={errors.phone}
                />
              </View>

              <Button
                title={isSaving ? 'Saving...' : 'Continue to Dashboard'}
                onPress={handleSave}
                disabled={isSaving}
                loading={isSaving}
                fullWidth
                style={{ marginTop: spacing['2xl'] }}
              />

              <Text style={styles.footerText}>
                This information helps us personalize your experience
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  container: {
    backgroundColor: colors.white,
    borderRadius: borderRadius['2xl'],
    width: '100%',
    maxWidth: 440,
    overflow: 'hidden',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  header: {
    paddingHorizontal: spacing['2xl'],
    paddingTop: spacing['2xl'],
    paddingBottom: spacing.xl,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.lg,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  headerTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
    marginBottom: spacing.xs,
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
    color: 'rgba(255,255,255,0.8)',
  },
  form: {
    padding: spacing['2xl'],
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[200],
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorBannerText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: colors.error[700],
  },
  footerText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
