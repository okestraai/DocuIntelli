import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Lock, Eye, EyeOff } from 'lucide-react-native';
import { supabase } from '../../src/lib/supabase';
import Button from '../../src/components/ui/Button';
import Input from '../../src/components/ui/Input';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { spacing, borderRadius } from '../../src/theme/spacing';

export default function ResetPasswordScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdatePassword = async () => {
    setError(null);

    if (!newPassword || newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      router.replace('/(tabs)/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.iconBox}>
              <Lock size={28} color={colors.white} strokeWidth={2.5} />
            </View>
            <Text style={styles.title}>Set New Password</Text>
            <Text style={styles.subtitle}>
              Create a new password for{' '}
              <Text style={styles.emailBold}>{email}</Text>
            </Text>
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.form}>
            <Input
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="Enter new password"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              editable={!loading}
              icon={<Lock size={18} color={colors.slate[400]} />}
              rightIcon={
                showPassword
                  ? <EyeOff size={18} color={colors.slate[400]} />
                  : <Eye size={18} color={colors.slate[400]} />
              }
              onRightIconPress={() => setShowPassword(!showPassword)}
            />

            <Input
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm new password"
              secureTextEntry={!showConfirm}
              autoCapitalize="none"
              editable={!loading}
              icon={<Lock size={18} color={colors.slate[400]} />}
              rightIcon={
                showConfirm
                  ? <EyeOff size={18} color={colors.slate[400]} />
                  : <Eye size={18} color={colors.slate[400]} />
              }
              onRightIconPress={() => setShowConfirm(!showConfirm)}
            />

            <Button
              title="Update Password"
              onPress={handleUpdatePassword}
              loading={loading}
              disabled={loading || !newPassword || !confirmPassword}
              size="lg"
            />
          </View>

          <View style={styles.footer}>
            <TouchableOpacity onPress={() => router.replace('/(auth)/login')} disabled={loading}>
              <Text style={styles.linkText}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing['2xl'] },
  header: { alignItems: 'center', marginBottom: spacing['2xl'] },
  iconBox: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.xl,
    backgroundColor: colors.primary[600],
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.fontSize.base,
    color: colors.slate[500],
    textAlign: 'center',
  },
  emailBold: {
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[700],
  },
  errorBox: {
    backgroundColor: '#fee2e2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: { color: '#dc2626', fontSize: typography.fontSize.sm },
  form: { gap: spacing.lg },
  footer: { alignItems: 'center', marginTop: spacing['3xl'] },
  linkText: {
    color: colors.primary[600],
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
});
