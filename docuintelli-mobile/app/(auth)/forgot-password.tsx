import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { resetPasswordWithOTP } from '../../src/lib/supabase';
import Button from '../../src/components/ui/Button';
import Input from '../../src/components/ui/Input';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { spacing, borderRadius } from '../../src/theme/spacing';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReset = async () => {
    if (!email) { setError('Please enter your email address'); return; }
    setLoading(true);
    setError(null);

    try {
      await resetPasswordWithOTP(email);
      router.push({ pathname: '/(auth)/verify-otp', params: { email, flow: 'reset' } });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.iconBox}><Text style={styles.iconText}>D</Text></View>
            <Text style={styles.title}>Reset Password</Text>
            <Text style={styles.subtitle}>Enter your email to receive a verification code</Text>
          </View>

          {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}

          <View style={styles.form}>
            <Input label="Email Address" value={email} onChangeText={setEmail} placeholder="Enter your email" keyboardType="email-address" autoCapitalize="none" autoComplete="email" editable={!loading} />
            <Button title="Send Reset Code" onPress={handleReset} loading={loading} disabled={loading} size="lg" />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Remember your password? </Text>
            <TouchableOpacity onPress={() => router.push('/(auth)/login')}><Text style={styles.linkText}>Sign in</Text></TouchableOpacity>
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
  iconBox: { width: 64, height: 64, borderRadius: borderRadius.xl, backgroundColor: colors.primary[600], justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  iconText: { color: colors.white, fontSize: typography.fontSize['3xl'], fontWeight: typography.fontWeight.bold },
  title: { fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.bold, color: colors.slate[900], marginBottom: spacing.xs },
  subtitle: { fontSize: typography.fontSize.base, color: colors.slate[500], textAlign: 'center' },
  errorBox: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca', borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg },
  errorText: { color: '#dc2626', fontSize: typography.fontSize.sm },
  form: { gap: spacing.lg },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing['3xl'] },
  footerText: { color: colors.slate[500], fontSize: typography.fontSize.sm },
  linkText: { color: colors.primary[600], fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.semibold },
});
