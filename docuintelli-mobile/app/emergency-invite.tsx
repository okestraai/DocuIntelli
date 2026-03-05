import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import {
  Shield,
  Users,
  CheckCircle,
  AlertTriangle,
  X,
  UserPlus,
  LogIn,
} from 'lucide-react-native';
import {
  validateInvite,
  acceptInvite,
  declineInvite,
  type InviteInfo,
} from '../src/lib/emergencyAccessApi';
import { useAuthStore } from '../src/store/authStore';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { spacing, borderRadius } from '../src/theme/spacing';

type ScreenState = 'loading' | 'error' | 'invite' | 'accepted' | 'declined';

export default function EmergencyInviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { user } = useAuthStore();

  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [declining, setDeclining] = useState(false);
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Validate the invite token on mount
  useEffect(() => {
    if (!token) {
      setError('No invitation token provided.');
      setScreenState('error');
      return;
    }

    let cancelled = false;

    validateInvite(token)
      .then((info) => {
        if (cancelled) return;
        setInvite(info);
        setScreenState('invite');
      })
      .catch(() => {
        if (cancelled) return;
        setError('This invitation is invalid or has already been used.');
        setScreenState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Clean up auto-redirect timer on unmount
  useEffect(() => {
    return () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    };
  }, []);

  const handleAccept = async () => {
    if (!token || accepting) return;
    setAccepting(true);
    try {
      await acceptInvite(token);
      setScreenState('accepted');
      redirectTimer.current = setTimeout(() => {
        router.replace('/shared-with-me');
      }, 2000);
    } catch (err: any) {
      setError(err.message || 'Failed to accept invitation. Please try again.');
      setScreenState('error');
    } finally {
      setAccepting(false);
    }
  };

  const handleDecline = async () => {
    if (!token || declining) return;
    setDeclining(true);
    try {
      await declineInvite(token);
    } catch {
      // Decline is best-effort; show declined state regardless
    } finally {
      setDeclining(false);
      setScreenState('declined');
    }
  };

  const handleGoBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  // -- Loading state --
  const renderLoading = () => (
    <View style={styles.centeredContainer}>
      <ActivityIndicator size="large" color={colors.primary[600]} />
      <Text style={styles.loadingText}>Validating invitation...</Text>
    </View>
  );

  // -- Error state --
  const renderError = () => (
    <View style={styles.centeredContainer}>
      <View style={styles.card}>
        <View style={[styles.iconCircleLarge, styles.iconCircleError]}>
          <AlertTriangle size={32} color={colors.error[500]} strokeWidth={2} />
        </View>
        <Text style={styles.cardTitle}>Invalid Invitation</Text>
        <Text style={styles.cardDescription}>
          {error || 'This invitation link is not valid.'}
        </Text>
        <TouchableOpacity
          style={styles.linkButton}
          onPress={handleGoBack}
          activeOpacity={0.7}
        >
          <Text style={styles.linkButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // -- Accepted state --
  const renderAccepted = () => (
    <View style={styles.centeredContainer}>
      <View style={styles.card}>
        <View style={[styles.iconCircleLarge, styles.iconCircleSuccess]}>
          <CheckCircle size={32} color={colors.primary[600]} strokeWidth={2} />
        </View>
        <Text style={styles.cardTitle}>Invitation Accepted!</Text>
        <Text style={styles.cardDescription}>
          You are now a trusted contact for{' '}
          <Text style={styles.bold}>{invite?.ownerName}</Text>.
        </Text>
        <Text style={styles.redirectHint}>
          Redirecting to your shared documents...
        </Text>
      </View>
    </View>
  );

  // -- Declined state --
  const renderDeclined = () => (
    <View style={styles.centeredContainer}>
      <View style={styles.card}>
        <View style={[styles.iconCircleLarge, styles.iconCircleNeutral]}>
          <X size={32} color={colors.slate[400]} strokeWidth={2} />
        </View>
        <Text style={styles.cardTitle}>Invitation Declined</Text>
        <Text style={styles.cardDescription}>
          No worries. You won't receive further notifications about this.
        </Text>
        <TouchableOpacity
          style={styles.linkButton}
          onPress={handleGoBack}
          activeOpacity={0.7}
        >
          <Text style={styles.linkButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // -- Auth prompt (user not logged in) --
  const renderAuthPrompt = () => (
    <View style={styles.authSection}>
      <Text style={styles.authPromptText}>
        You need a DocuIntelli account to accept this invitation.
      </Text>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => router.push('/(auth)/signup')}
        activeOpacity={0.8}
      >
        <UserPlus size={20} color={colors.white} strokeWidth={2} />
        <Text style={styles.primaryButtonText}>Create Free Account</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.outlineButton}
        onPress={() => router.push('/(auth)/login')}
        activeOpacity={0.8}
      >
        <LogIn size={20} color={colors.slate[700]} strokeWidth={2} />
        <Text style={styles.outlineButtonText}>I Already Have an Account</Text>
      </TouchableOpacity>
      <Text style={styles.finePrint}>
        No credit card required. Creating an account is free.
      </Text>
    </View>
  );

  // -- Action buttons (user authenticated) --
  const renderActions = () => (
    <View style={styles.actionsSection}>
      <TouchableOpacity
        style={[styles.primaryButton, accepting && styles.buttonDisabled]}
        onPress={handleAccept}
        disabled={accepting || declining}
        activeOpacity={0.8}
      >
        {accepting ? (
          <ActivityIndicator size="small" color={colors.white} />
        ) : (
          <CheckCircle size={20} color={colors.white} strokeWidth={2} />
        )}
        <Text style={styles.primaryButtonText}>Accept Invitation</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.outlineButton, declining && styles.buttonDisabled]}
        onPress={handleDecline}
        disabled={accepting || declining}
        activeOpacity={0.8}
      >
        {declining ? (
          <ActivityIndicator size="small" color={colors.slate[500]} />
        ) : null}
        <Text style={styles.outlineButtonText}>Decline</Text>
      </TouchableOpacity>
    </View>
  );

  // -- Main invite card --
  const renderInvite = () => (
    <ScrollView
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      <View style={styles.cardOuter}>
        {/* Green header section */}
        <View style={styles.headerSection}>
          <View style={styles.headerIconContainer}>
            <Shield size={28} color={colors.white} strokeWidth={2} />
          </View>
          <Text style={styles.headerTitle}>DocuIntelli AI</Text>
          <Text style={styles.headerSubtitle}>
            Your Intelligent Document Vault
          </Text>
        </View>

        {/* Card body */}
        <View style={styles.cardBody}>
          {/* Owner info row */}
          <View style={styles.ownerRow}>
            <View style={styles.ownerIconCircle}>
              <Users size={24} color={colors.primary[600]} strokeWidth={2} />
            </View>
            <View style={styles.ownerInfo}>
              <Text style={styles.ownerName}>{invite?.ownerName}</Text>
              <Text style={styles.ownerLabel}>
                has added you as a trusted contact
                {invite?.relationship ? (
                  <Text style={styles.relationship}>
                    {' '}({invite.relationship})
                  </Text>
                ) : null}
              </Text>
            </View>
          </View>

          {/* Explanation box */}
          <View style={styles.explanationBox}>
            <Text style={styles.explanationText}>
              As a trusted contact, you may be granted access to view important
              documents that{' '}
              <Text style={styles.bold}>{invite?.ownerName}</Text> has organized
              in their life event checklists. This is a read-only view for
              emergency or planning purposes.
            </Text>
          </View>

          {/* Auth-gated actions */}
          {user ? renderActions() : renderAuthPrompt()}
        </View>
      </View>
    </ScrollView>
  );

  // Map screen state to renderer
  const renderers: Record<ScreenState, () => React.JSX.Element> = {
    loading: renderLoading,
    error: renderError,
    invite: renderInvite,
    accepted: renderAccepted,
    declined: renderDeclined,
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safeArea}>
        {renderers[screenState]()}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.slate[50],
  },

  // -- Centered layout (loading, error, accepted, declined) --
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },

  loadingText: {
    marginTop: spacing.lg,
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
  },

  // -- Generic card (error, accepted, declined states) --
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.white,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.slate[200],
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing['3xl'],
    alignItems: 'center',
    // Shadow
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },

  iconCircleLarge: {
    width: 64,
    height: 64,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  iconCircleError: {
    backgroundColor: colors.error[50],
  },
  iconCircleSuccess: {
    backgroundColor: colors.primary[50],
  },
  iconCircleNeutral: {
    backgroundColor: colors.slate[100],
  },

  cardTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  cardDescription: {
    fontSize: typography.fontSize.base,
    color: colors.slate[600],
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing.lg,
  },

  redirectHint: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center',
  },

  linkButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  linkButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[600],
  },

  bold: {
    fontWeight: typography.fontWeight.bold,
  },

  // -- Invite card (main state) --
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing['2xl'],
  },

  cardOuter: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    backgroundColor: colors.white,
    borderRadius: borderRadius['2xl'],
    borderWidth: 1,
    borderColor: colors.slate[200],
    overflow: 'hidden',
    // Shadow
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },

  // -- Green header section --
  headerSection: {
    backgroundColor: colors.primary[600],
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing['2xl'],
    alignItems: 'center',
  },
  headerIconContainer: {
    width: 56,
    height: 56,
    borderRadius: borderRadius.xl,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
  headerSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[100],
    marginTop: spacing.xs,
  },

  // -- Card body --
  cardBody: {
    paddingHorizontal: spacing['2xl'],
    paddingVertical: spacing['2xl'],
  },

  // Owner info row
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  ownerIconCircle: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.full,
    backgroundColor: colors.primary[100],
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ownerInfo: {
    flex: 1,
  },
  ownerName: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  ownerLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    marginTop: 2,
    lineHeight: 20,
  },
  relationship: {
    color: colors.slate[400],
  },

  // Explanation box
  explanationBox: {
    backgroundColor: colors.slate[50],
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.slate[100],
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    marginBottom: spacing.xl,
  },
  explanationText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[700],
    lineHeight: 21,
  },

  // -- Action buttons (authenticated) --
  actionsSection: {
    gap: spacing.md,
  },

  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary[600],
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
  },
  primaryButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.white,
  },

  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    paddingVertical: 14,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.slate[200],
  },
  outlineButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[700],
  },

  buttonDisabled: {
    opacity: 0.6,
  },

  // -- Auth prompt (unauthenticated) --
  authSection: {
    gap: spacing.md,
  },
  authPromptText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[600],
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  finePrint: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
