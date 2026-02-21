import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
import { usePathname, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LayoutDashboard, FileText, Landmark, Compass, Settings, Crown } from 'lucide-react-native';
import { useSubscription } from '../hooks/useSubscription';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing } from '../theme/spacing';

const TABS = [
  {
    label: 'Home',
    route: '/(tabs)/dashboard',
    icon: LayoutDashboard,
    match: ['/dashboard'],
    requiredPlan: null as null | 'starter' | 'pro',
  },
  {
    label: 'Vault',
    route: '/(tabs)/vault',
    icon: FileText,
    match: ['/vault'],
    requiredPlan: null as null | 'starter' | 'pro',
  },
  {
    label: 'Financial',
    route: '/financial-insights',
    icon: Landmark,
    match: ['/financial-insights'],
    requiredPlan: 'starter' as null | 'starter' | 'pro',
  },
  {
    label: 'Life Events',
    route: '/life-events',
    icon: Compass,
    match: ['/life-events'],
    requiredPlan: 'pro' as null | 'starter' | 'pro',
  },
  {
    label: 'Settings',
    route: '/(tabs)/settings',
    icon: Settings,
    match: ['/settings', '/billing', '/help', '/status'],
    requiredPlan: null as null | 'starter' | 'pro',
  },
];

// Screens where the tab bar should be hidden (auth, splash)
const HIDDEN_ON = ['/', '/index', '/login', '/signup', '/forgot-password'];

export default function PersistentTabBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { isPro, isStarterOrAbove } = useSubscription();

  // Hide on auth / splash screens
  const shouldHide = HIDDEN_ON.some(
    (p) => pathname === p || pathname.startsWith('/(auth)'),
  );
  if (shouldHide) return null;

  const bottomPadding = Platform.select({
    ios: Math.max(insets.bottom, 8),
    default: 8,
  });

  const isLocked = (requiredPlan: null | 'starter' | 'pro') => {
    if (!requiredPlan) return false;
    if (requiredPlan === 'starter') return !isStarterOrAbove;
    return !isPro;
  };

  return (
    <View
      style={[
        styles.container,
        { paddingBottom: bottomPadding },
      ]}
    >
      {TABS.map((tab) => {
        const active = tab.match.some((m) => pathname.includes(m));
        const locked = isLocked(tab.requiredPlan);
        const Icon = tab.icon;
        return (
          <TouchableOpacity
            key={tab.label}
            style={styles.tab}
            onPress={() => router.navigate(tab.route as any)}
            activeOpacity={0.7}
          >
            <View style={{ position: 'relative' }}>
              <Icon
                size={22}
                color={active ? colors.primary[600] : colors.slate[400]}
                strokeWidth={1.8}
              />
              {locked && (
                <View style={[
                  styles.crownBadge,
                  { backgroundColor: tab.requiredPlan === 'pro' ? '#d97706' : colors.primary[600] },
                ]}>
                  <Crown size={8} color={colors.white} strokeWidth={2.5} />
                </View>
              )}
            </View>
            <Text style={[styles.label, active && styles.labelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.slate[200],
    paddingTop: 10,
    elevation: 8,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  label: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[400],
  },
  labelActive: {
    color: colors.primary[600],
  },
  crownBadge: {
    position: 'absolute',
    top: -4,
    right: -6,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: colors.white,
  },
});
