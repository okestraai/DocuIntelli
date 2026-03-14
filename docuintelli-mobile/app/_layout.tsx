import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, View, Text, StyleSheet, Platform, TouchableOpacity } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import NetInfo from '@react-native-community/netinfo';
import { ArrowLeft, Shield, Monitor } from 'lucide-react-native';
import { goBack } from '../src/utils/navigation';
import { auth } from '../src/lib/auth';
import { useAuthStore } from '../src/store/authStore';
import { useAppStore } from '../src/store/appStore';
import { useBiometrics } from '../src/hooks/useBiometrics';
import { usePushNotifications } from '../src/hooks/usePushNotifications';
import { setupDeepLinkListener } from '../src/services/deepLinking';
import { ToastProvider, ToastRenderer } from '../src/contexts/ToastContext';
import LoadingSpinner from '../src/components/ui/LoadingSpinner';
import OfflineBanner from '../src/components/ui/OfflineBanner';
import DunningBanner from '../src/components/ui/DunningBanner';
import PersistentTabBar from '../src/components/PersistentTabBar';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { spacing, MAX_APP_WIDTH } from '../src/theme/spacing';

export default function RootLayout() {
  const { initialized, loading, initialize, setSession, session } = useAuthStore();
  const setOnline = useAppStore((s) => s.setOnline);
  const isLocked = useAppStore((s) => s.isLocked);
  const setLocked = useAppStore((s) => s.setLocked);
  const { enabled: biometricEnabled, promptBiometric } = useBiometrics();
  const appState = useRef(AppState.currentState);
  const [unlocking, setUnlocking] = useState(false);

  // Initialize push notifications when authenticated
  usePushNotifications();

  useEffect(() => {
    const boot = async () => {
      // On web, check for OAuth callback tokens in the URL query params.
      // After Google OAuth, the backend redirects back with ?access_token=...&refresh_token=...
      if (Platform.OS === 'web') {
        const params = new URLSearchParams(window.location.search);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          // Store the tokens and establish the session
          await auth.setSession({ access_token: accessToken, refresh_token: refreshToken });

          // Clean tokens from URL so they aren't bookmarked or leaked via Referer
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, '', cleanUrl);
        }
      }

      // Now initialize (reads tokens from storage)
      await initialize();
    };

    boot();

    const {
      data: { subscription },
    } = auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Network monitoring
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(state.isConnected ?? true);
    });
    return () => unsubscribe();
  }, []);

  // Deep link listener
  useEffect(() => {
    const cleanup = setupDeepLinkListener();
    return cleanup;
  }, []);

  // Biometric lock on app resume
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === 'active' &&
        biometricEnabled &&
        session
      ) {
        setLocked(true);
      }
      appState.current = nextState;
    });

    return () => subscription.remove();
  }, [biometricEnabled, session]);

  const handleUnlock = async () => {
    setUnlocking(true);
    const success = await promptBiometric();
    if (success) {
      setLocked(false);
    }
    setUnlocking(false);
  };

  const handleSwitchToDesktop = useCallback(() => {
    if (Platform.OS === 'web') {
      document.cookie = 'prefer_desktop=1; path=/; max-age=86400; SameSite=Lax';
      window.location.reload();
    }
  }, []);

  if (!initialized || loading) {
    return <LoadingSpinner fullScreen />;
  }

  return (
    <ToastProvider>
    <View style={[{ flex: 1 }, Platform.OS === 'web' && webShell.outer]}>
      <View style={[{ flex: 1 }, Platform.OS === 'web' && webShell.inner]}>
      <StatusBar style="dark" />
      <OfflineBanner />
      {session && <DunningBanner />}
      <Stack
        screenOptions={{
          headerShown: false,
          headerStyle: { backgroundColor: colors.white },
          headerTintColor: colors.slate[900],
          headerTitleStyle: { fontWeight: '600', fontSize: 17 },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: colors.slate[50] },
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => goBack()}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.slate[100], alignItems: 'center', justifyContent: 'center', marginRight: 8 }}
              activeOpacity={0.7}
            >
              <ArrowLeft size={20} color={colors.slate[700]} strokeWidth={2} />
            </TouchableOpacity>
          ),
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="document/[id]"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="scan"
          options={{ presentation: 'modal' }}
        />
        <Stack.Screen
          name="upload"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: 'Upload Document',
          }}
        />
        <Stack.Screen
          name="search"
          options={{ headerShown: true, title: 'Search' }}
        />
        <Stack.Screen
          name="financial-insights"
          options={{ headerShown: true, title: 'Financial Insights' }}
        />
        <Stack.Screen
          name="life-events"
          options={{ headerShown: true, title: 'Life Events' }}
        />
        <Stack.Screen
          name="audit"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="billing"
          options={{ headerShown: true, title: 'Billing' }}
        />
        <Stack.Screen name="settings" />
        <Stack.Screen
          name="help"
          options={{ headerShown: true, title: 'Help Center' }}
        />
        <Stack.Screen
          name="status"
          options={{ headerShown: true, title: 'System Status' }}
        />
      </Stack>

      {/* Persistent bottom navigation — visible on all pages */}
      <PersistentTabBar />

      {/* Toast rendered inside the app shell so it centers within 480px on web */}
      <ToastRenderer />

      {/* "View Desktop Site" link — web only */}
      {Platform.OS === 'web' && (
        <TouchableOpacity
          style={desktopSwitchStyles.container}
          onPress={handleSwitchToDesktop}
          activeOpacity={0.7}
        >
          <Monitor size={14} color={colors.slate[500]} />
          <Text style={desktopSwitchStyles.text}>View Desktop Site</Text>
        </TouchableOpacity>
      )}

      {/* Biometric lock overlay */}
      {isLocked && (
        <View style={lockStyles.overlay}>
          <View style={lockStyles.content}>
            <Shield size={48} color={colors.primary[600]} strokeWidth={1.5} />
            <Text style={lockStyles.title}>DocuIntelli Locked</Text>
            <Text style={lockStyles.subtitle}>Authenticate to continue</Text>
            <TouchableOpacity
              style={lockStyles.button}
              onPress={handleUnlock}
              disabled={unlocking}
              activeOpacity={0.7}
            >
              <Text style={lockStyles.buttonText}>
                {unlocking ? 'Authenticating...' : 'Unlock'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
      </View>
    </View>
    </ToastProvider>
  );
}

const webShell = StyleSheet.create({
  outer: {
    alignItems: 'center',
    backgroundColor: colors.slate[100],
  },
  inner: {
    width: '100%',
    maxWidth: MAX_APP_WIDTH,
    backgroundColor: colors.slate[50],
    // Subtle shadow to frame the app on wide screens
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 8,
  },
});

const desktopSwitchStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.slate[200],
    backgroundColor: colors.white,
  },
  text: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
  },
});

const lockStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.slate[50],
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
  },
  content: {
    alignItems: 'center',
    gap: spacing.lg,
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  subtitle: {
    fontSize: typography.fontSize.base,
    color: colors.slate[500],
  },
  button: {
    backgroundColor: colors.primary[600],
    paddingHorizontal: spacing['3xl'],
    paddingVertical: spacing.md,
    borderRadius: 12,
    marginTop: spacing.lg,
  },
  buttonText: {
    color: colors.white,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
  },
});
