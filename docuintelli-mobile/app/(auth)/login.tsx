import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  ShieldCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
} from 'lucide-react-native';
import { signIn, signInWithGoogle } from '../../src/lib/supabase';
import Button from '../../src/components/ui/Button';
import Input from '../../src/components/ui/Input';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { spacing, borderRadius } from '../../src/theme/spacing';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await signIn(email, password);
      router.replace('/(tabs)/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);

    try {
      await signInWithGoogle();
      // On native, the session is set automatically after the browser redirect.
      // On web, the page redirects so this line won't execute.
      router.replace('/(tabs)/dashboard');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Gradient Header */}
          <LinearGradient
            colors={[...colors.gradient.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.gradientHeader}
          >
            <View style={styles.headerContent}>
              <View style={styles.logoContainer}>
                <ShieldCheck size={36} color={colors.white} strokeWidth={2} />
              </View>
              <Text style={styles.brandName}>DocuIntelli AI</Text>
              <Text style={styles.welcomeTitle}>Welcome Back</Text>
              <Text style={styles.welcomeSubtitle}>
                Sign in to access your secure document vault
              </Text>
            </View>
            {/* Curved bottom edge */}
            <View style={styles.curveOverlay} />
          </LinearGradient>

          {/* Form Card */}
          <View style={styles.formCard}>
            {/* Error Message */}
            {error && (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* Email Input */}
            <Input
              label="Email Address"
              value={email}
              onChangeText={(text) => {
                setEmail(text);
                if (error) setError(null);
              }}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!loading}
              returnKeyType="next"
              blurOnSubmit={false}
              icon={<Mail size={18} color={colors.slate[400]} strokeWidth={1.8} />}
            />

            {/* Password Input */}
            <Input
              label="Password"
              value={password}
              onChangeText={(text) => {
                setPassword(text);
                if (error) setError(null);
              }}
              placeholder="Enter your password"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="password"
              editable={!loading}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              icon={<Lock size={18} color={colors.slate[400]} strokeWidth={1.8} />}
              rightIcon={
                showPassword ? (
                  <EyeOff size={18} color={colors.slate[500]} strokeWidth={1.8} />
                ) : (
                  <Eye size={18} color={colors.slate[500]} strokeWidth={1.8} />
                )
              }
              onRightIconPress={() => setShowPassword(!showPassword)}
            />

            {/* Forgot Password */}
            <TouchableOpacity
              onPress={() => router.push('/(auth)/forgot-password')}
              style={styles.forgotRow}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.forgotText}>Forgot your password?</Text>
            </TouchableOpacity>

            {/* Sign In Button */}
            <Button
              title="Sign In"
              onPress={handleLogin}
              loading={loading}
              disabled={loading}
              size="lg"
              iconRight={
                !loading ? (
                  <ArrowRight size={18} color={colors.white} strokeWidth={2} />
                ) : undefined
              }
            />

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google Sign In */}
            <TouchableOpacity
              onPress={handleGoogleSignIn}
              style={[styles.googleButton, (loading || googleLoading) && { opacity: 0.6 }]}
              activeOpacity={0.7}
              disabled={loading || googleLoading}
            >
              {googleLoading ? (
                <ActivityIndicator size="small" color={colors.slate[600]} />
              ) : (
                <Text style={styles.googleG}>G</Text>
              )}
              <Text style={styles.googleText}>Continue with Google</Text>
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Don't have an account? </Text>
              <TouchableOpacity
                onPress={() => router.push('/(auth)/signup')}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <Text style={styles.linkText}>Sign up</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.poweredBy}>Powered by Okestra AI Labs</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.slate[50],
  },
  flex: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
  },

  /* ---- Gradient Header ---- */
  gradientHeader: {
    paddingTop: Platform.OS === 'ios' ? 60 : 48,
    paddingBottom: 48,
    paddingHorizontal: spacing['2xl'],
    position: 'relative',
    overflow: 'hidden',
  },
  headerContent: {
    alignItems: 'center',
    zIndex: 1,
  },
  logoContainer: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  brandName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  welcomeTitle: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
    marginBottom: spacing.xs,
  },
  welcomeSubtitle: {
    fontSize: typography.fontSize.base,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: typography.fontSize.base * typography.lineHeight.normal,
  },
  curveOverlay: {
    position: 'absolute',
    bottom: -1,
    left: 0,
    right: 0,
    height: 24,
    backgroundColor: colors.slate[50],
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },

  /* ---- Form Card ---- */
  formCard: {
    marginTop: -4,
    marginHorizontal: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    padding: spacing['2xl'],
    gap: spacing.lg,
    // Card shadow
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },

  /* ---- Error ---- */
  errorBox: {
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[200],
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  errorText: {
    color: colors.error[700],
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    flex: 1,
  },

  /* ---- Forgot Password ---- */
  forgotRow: {
    alignSelf: 'flex-end',
    marginTop: -spacing.sm,
  },
  forgotText: {
    color: colors.primary[600],
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },

  /* ---- Divider ---- */
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.xs,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.slate[200],
  },
  dividerText: {
    marginHorizontal: spacing.md,
    color: colors.slate[400],
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  /* ---- Google Button ---- */
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.lg,
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    gap: spacing.md,
  },
  googleG: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[600],
  },
  googleText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[700],
  },

  /* ---- Footer ---- */
  footer: {
    alignItems: 'center',
    paddingTop: spacing['3xl'],
    paddingBottom: spacing['2xl'],
    gap: spacing.md,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  footerText: {
    color: colors.slate[500],
    fontSize: typography.fontSize.sm,
  },
  linkText: {
    color: colors.primary[600],
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
  },
  poweredBy: {
    color: colors.slate[400],
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.normal,
    letterSpacing: 0.3,
  },
});
