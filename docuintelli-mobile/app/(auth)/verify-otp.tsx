import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '../../src/utils/navigation';
import { supabase, verifySignupOTP, sendSignupOTP, verifyOTP, resetPasswordWithOTP } from '../../src/lib/supabase';
import Button from '../../src/components/ui/Button';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { spacing, borderRadius } from '../../src/theme/spacing';

export default function VerifyOtpScreen() {
  const { email, flow } = useLocalSearchParams<{ email: string; flow: 'signup' | 'reset' }>();
  const isSignup = flow === 'signup';

  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', '']);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(60);
  const [resendCount, setResendCount] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...digits];
    newDigits[index] = digit;
    setDigits(newDigits);
    if (digit && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !digits[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const otpCode = digits.join('');

  const handleVerify = async () => {
    if (otpCode.length !== 6) { setError('Please enter all 6 digits'); return; }
    setLoading(true);
    setError(null);

    try {
      if (isSignup) {
        const result = await verifySignupOTP(email!, otpCode);
        if (result.token_hash) {
          const { data, error: verifyError } = await supabase.auth.verifyOtp({ token_hash: result.token_hash, type: 'magiclink' });
          if (verifyError) throw verifyError;
          if (data.user) router.replace('/(tabs)/dashboard');
        } else {
          setSuccess('Account created! Redirecting to sign in...');
          setTimeout(() => router.replace('/(auth)/login'), 2000);
        }
      } else {
        await verifyOTP(email!, otpCode, 'recovery');
        // OTP verified — navigate to set new password screen
        router.replace({ pathname: '/(auth)/reset-password', params: { email: email! } });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || (isSignup && resendCount >= 3)) return;
    setLoading(true);
    setError(null);
    try {
      if (isSignup) await sendSignupOTP(email!, '');
      else await resetPasswordWithOTP(email!);
      setResendCount((p) => p + 1);
      setResendCooldown(60);
      setDigits(['', '', '', '', '', '']);
      setSuccess('New verification code sent!');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to resend code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View style={styles.iconBox}><Text style={styles.iconText}>*</Text></View>
            <Text style={styles.title}>Verify Your Email</Text>
            <Text style={styles.subtitle}>We sent a 6-digit code to <Text style={styles.emailBold}>{email}</Text></Text>
          </View>

          {error && <View style={styles.errorBox}><Text style={styles.errorText}>{error}</Text></View>}
          {success && <View style={styles.successBox}><Text style={styles.successText}>{success}</Text></View>}

          <View style={styles.otpRow}>
            {digits.map((digit, i) => (
              <TextInput
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                style={[styles.otpInput, digit && styles.otpFilled]}
                value={digit}
                onChangeText={(v) => handleDigitChange(i, v)}
                onKeyPress={({ nativeEvent }) => handleKeyPress(i, nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={1}
                editable={!loading}
                autoFocus={i === 0}
              />
            ))}
          </View>

          <Button title="Verify Code" onPress={handleVerify} loading={loading} disabled={loading || otpCode.length !== 6} size="lg" />

          <View style={styles.resendRow}>
            <Text style={styles.resendLabel}>Didn't receive the code? </Text>
            <TouchableOpacity onPress={handleResend} disabled={loading || resendCooldown > 0 || (isSignup && resendCount >= 3)}>
              <Text style={[styles.resendLink, (resendCooldown > 0 || (isSignup && resendCount >= 3)) && styles.resendDisabled]}>
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : isSignup && resendCount >= 3 ? 'Too many attempts' : 'Resend'}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => goBack('/(auth)/login')} style={styles.backBtn} disabled={loading}>
            <Text style={styles.backText}>Back to {isSignup ? 'signup' : 'password reset'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.white },
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', padding: spacing['2xl'] },
  header: { alignItems: 'center', marginBottom: spacing['2xl'] },
  iconBox: { width: 64, height: 64, borderRadius: borderRadius.xl, backgroundColor: colors.primary[600], justifyContent: 'center', alignItems: 'center', marginBottom: spacing.lg },
  iconText: { color: colors.white, fontSize: typography.fontSize['3xl'], fontWeight: typography.fontWeight.bold },
  title: { fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.bold, color: colors.slate[900], marginBottom: spacing.xs },
  subtitle: { fontSize: typography.fontSize.base, color: colors.slate[500], textAlign: 'center' },
  emailBold: { fontWeight: typography.fontWeight.semibold, color: colors.slate[700] },
  errorBox: { backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca', borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg },
  errorText: { color: '#dc2626', fontSize: typography.fontSize.sm },
  successBox: { backgroundColor: colors.primary[50], borderWidth: 1, borderColor: colors.primary[200], borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.lg },
  successText: { color: colors.primary[700], fontSize: typography.fontSize.sm },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing['2xl'] },
  otpInput: { width: 48, height: 56, borderWidth: 2, borderColor: colors.slate[300], borderRadius: borderRadius.lg, textAlign: 'center', fontSize: typography.fontSize.xl, fontWeight: typography.fontWeight.bold, color: colors.slate[900] },
  otpFilled: { borderColor: colors.primary[500] },
  resendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.xl },
  resendLabel: { color: colors.slate[500], fontSize: typography.fontSize.sm },
  resendLink: { color: colors.primary[600], fontSize: typography.fontSize.sm, fontWeight: typography.fontWeight.medium },
  resendDisabled: { opacity: 0.5 },
  backBtn: { alignItems: 'center', marginTop: spacing.lg },
  backText: { color: colors.slate[500], fontSize: typography.fontSize.sm },
});
