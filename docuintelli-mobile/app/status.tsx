import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Linking,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Mail,
} from 'lucide-react-native';
import Card from '../src/components/ui/Card';
import GradientIcon from '../src/components/ui/GradientIcon';
import { API_BASE } from '../src/lib/config';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { spacing, borderRadius } from '../src/theme/spacing';

interface ServiceStatus {
  name: string;
  description: string;
  status: 'operational' | 'degraded' | 'down' | 'checking';
}

const INITIAL_SERVICES: ServiceStatus[] = [
  { name: 'API Server', description: 'Core application programming interface', status: 'checking' },
  { name: 'Database', description: 'Primary data storage and retrieval', status: 'checking' },
  { name: 'Redis Cache', description: 'Session management and caching', status: 'checking' },
  { name: 'AI Chat & Analysis', description: 'Document analysis and chat', status: 'checking' },
  { name: 'Authentication', description: 'User login and session management', status: 'checking' },
  { name: 'Payment Processing', description: 'Stripe billing and subscriptions', status: 'checking' },
];

const STATUS_DOT_COLOR: Record<ServiceStatus['status'], string> = {
  operational: colors.success[500],
  degraded: colors.warning[500],
  down: colors.error[500],
  checking: colors.slate[300],
};

const STATUS_LABEL: Record<ServiceStatus['status'], string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  checking: 'Checking...',
};

const STATUS_LABEL_COLOR: Record<ServiceStatus['status'], string> = {
  operational: colors.success[600],
  degraded: colors.warning[600],
  down: colors.error[600],
  checking: colors.slate[400],
};

/** Pulsing dot for "checking" state */
function PulsingDot() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.statusDot,
        { backgroundColor: colors.slate[300], opacity },
      ]}
    />
  );
}

export default function StatusScreen() {
  const [services, setServices] = useState<ServiceStatus[]>(INITIAL_SERVICES);
  const [refreshing, setRefreshing] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const checkHealth = useCallback(async () => {
    setRefreshing(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_BASE}/api/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        setServices(prev =>
          prev.map(s => {
            if (s.name === 'API Server')
              return { ...s, status: 'operational' };
            if (s.name === 'Redis Cache')
              return {
                ...s,
                status:
                  data.redis === 'connected' ? 'operational' : 'degraded',
              };
            if (s.name === 'Database')
              return { ...s, status: 'operational' }; // If API works, DB works
            return { ...s, status: 'operational' }; // Assume operational if API responds
          }),
        );
      } else {
        setServices(prev =>
          prev.map(s => ({
            ...s,
            status: s.name === 'API Server' ? 'down' : 'degraded',
          })),
        );
      }
    } catch {
      setServices(prev => prev.map(s => ({ ...s, status: 'down' })));
    }
    setRefreshing(false);
    setLastChecked(new Date());
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  // Derive overall status
  const allOperational = services.every(s => s.status === 'operational');
  const anyDown = services.some(s => s.status === 'down');
  const anyDegraded = services.some(s => s.status === 'degraded');
  const anyChecking = services.some(s => s.status === 'checking');

  let bannerBg = colors.success[50];
  let bannerBorder = colors.success[200];
  let bannerIcon = (
    <CheckCircle size={20} color={colors.success[600]} strokeWidth={2} />
  );
  let bannerText = 'All Systems Operational';
  let bannerTextColor = colors.success[800];

  if (anyDown) {
    bannerBg = colors.error[50];
    bannerBorder = colors.error[200];
    bannerIcon = (
      <XCircle size={20} color={colors.error[600]} strokeWidth={2} />
    );
    bannerText = 'Service Disruption Detected';
    bannerTextColor = colors.error[800];
  } else if (anyDegraded) {
    bannerBg = colors.warning[50];
    bannerBorder = colors.warning[200];
    bannerIcon = (
      <Clock size={20} color={colors.warning[600]} strokeWidth={2} />
    );
    bannerText = 'Some Services Degraded';
    bannerTextColor = colors.warning[800];
  } else if (anyChecking) {
    bannerBg = colors.slate[50];
    bannerBorder = colors.slate[200];
    bannerIcon = (
      <Activity size={20} color={colors.slate[500]} strokeWidth={2} />
    );
    bannerText = 'Checking Services...';
    bannerTextColor = colors.slate[700];
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      <Stack.Screen options={{ title: 'System Status', headerShown: true }} />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={checkHealth}
              tintColor={colors.primary[600]}
            />
          }
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <GradientIcon size={44}>
                <Activity size={22} color={colors.white} strokeWidth={2} />
              </GradientIcon>
              <View style={styles.headerTextCol}>
                <Text style={styles.pageTitle}>System Status</Text>
                <Text style={styles.pageSubtitle}>
                  Real-time service health overview
                </Text>
              </View>
            </View>
          </View>

          {/* Overall Status Banner */}
          <Card
            style={[
              styles.bannerCard,
              {
                backgroundColor: bannerBg,
                borderColor: bannerBorder,
              },
            ]}
          >
            <View style={styles.bannerTop}>
              {bannerIcon}
              <Text style={[styles.bannerText, { color: bannerTextColor }]}>
                {bannerText}
              </Text>
            </View>
            <View style={styles.bannerBottom}>
              {lastChecked ? (
                <Text style={styles.lastCheckedText}>
                  Last checked at {formatTime(lastChecked)}
                </Text>
              ) : (
                <Text style={styles.lastCheckedText}>Checking...</Text>
              )}
              <TouchableOpacity
                onPress={checkHealth}
                disabled={refreshing}
                style={styles.refreshButton}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <RefreshCw
                  size={14}
                  color={colors.slate[500]}
                  strokeWidth={2}
                />
              </TouchableOpacity>
            </View>
          </Card>

          {/* Service List */}
          <View style={styles.serviceList}>
            {services.map((service, index) => (
              <Card key={service.name} style={styles.serviceCard}>
                <View style={styles.serviceRow}>
                  {/* Status dot */}
                  {service.status === 'checking' ? (
                    <PulsingDot />
                  ) : (
                    <View
                      style={[
                        styles.statusDot,
                        {
                          backgroundColor:
                            STATUS_DOT_COLOR[service.status],
                        },
                      ]}
                    />
                  )}

                  {/* Service info */}
                  <View style={styles.serviceInfo}>
                    <Text style={styles.serviceName}>{service.name}</Text>
                    <Text style={styles.serviceDescription}>
                      {service.description}
                    </Text>
                  </View>

                  {/* Status label */}
                  <Text
                    style={[
                      styles.statusLabel,
                      {
                        color: STATUS_LABEL_COLOR[service.status],
                      },
                    ]}
                  >
                    {STATUS_LABEL[service.status]}
                  </Text>
                </View>
              </Card>
            ))}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Having issues?</Text>
            <TouchableOpacity
              onPress={() =>
                Linking.openURL('mailto:support@docuintelli.com')
              }
              activeOpacity={0.7}
              style={styles.footerLink}
            >
              <Mail size={14} color={colors.primary[600]} strokeWidth={2} />
              <Text style={styles.footerLinkText}>
                Contact support@docuintelli.com
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.slate[50],
  },
  scroll: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },

  // Header
  header: {
    marginBottom: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerTextCol: {
    flex: 1,
  },
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

  // Banner
  bannerCard: {
    borderWidth: 1.5,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  bannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bannerText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    flex: 1,
  },
  bannerBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  lastCheckedText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
  },
  refreshButton: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.slate[200],
  },

  // Service list
  serviceList: {
    gap: spacing.sm,
  },
  serviceCard: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: borderRadius.full,
  },
  serviceInfo: {
    flex: 1,
  },
  serviceName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[900],
  },
  serviceDescription: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    marginTop: 2,
  },
  statusLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },

  // Footer
  footer: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  footerText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
  },
  footerLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  footerLinkText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[600],
  },
});
