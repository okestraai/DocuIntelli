import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Settings as SettingsIcon,
  User,
  Mail,
  CreditCard,
  LogOut,
  ChevronRight,
  Shield,
  Bell,
  HelpCircle,
  Activity,
  Smartphone,
} from 'lucide-react-native';
import { useAuthStore } from '../../src/store/authStore';
import { useSubscription } from '../../src/hooks/useSubscription';
import Card from '../../src/components/ui/Card';
import Badge from '../../src/components/ui/Badge';
import Button from '../../src/components/ui/Button';
import GradientIcon from '../../src/components/ui/GradientIcon';
import LoadingSpinner from '../../src/components/ui/LoadingSpinner';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { spacing, borderRadius } from '../../src/theme/spacing';

const MENU_ITEMS = [
  {
    icon: User,
    iconColor: colors.primary[600],
    iconBg: colors.primary[50],
    label: 'Edit Profile',
    subtitle: 'Name, email, bio',
    route: '/settings/profile' as const,
  },
  {
    icon: Shield,
    iconColor: colors.error[600],
    iconBg: colors.error[50],
    label: 'Security',
    subtitle: 'Password, biometrics, account',
    route: '/settings/security' as const,
  },
  {
    icon: Smartphone,
    iconColor: colors.primary[600],
    iconBg: colors.primary[50],
    label: 'Devices',
    subtitle: 'Manage connected devices',
    route: '/settings/devices' as const,
  },
  {
    icon: Bell,
    iconColor: colors.info[600],
    iconBg: colors.info[50],
    label: 'Notifications',
    subtitle: 'Email preferences',
    route: '/settings/preferences' as const,
  },
  {
    icon: CreditCard,
    iconColor: colors.warning[600],
    iconBg: colors.warning[50],
    label: 'Billing',
    subtitle: 'Subscription & payments',
    route: '/billing' as const,
  },
  {
    icon: HelpCircle,
    iconColor: colors.primary[600],
    iconBg: colors.teal[50],
    label: 'Help Center',
    subtitle: 'FAQs & support',
    route: '/help' as const,
  },
  {
    icon: Activity,
    iconColor: colors.slate[600],
    iconBg: colors.slate[100],
    label: 'System Status',
    subtitle: 'Service health',
    route: '/status' as const,
  },
];

export default function SettingsScreen() {
  const { user, signOut } = useAuthStore();
  const { subscription, loading: subLoading } = useSubscription();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/login');
  };

  const planName = subscription?.plan === 'pro' ? 'Pro' : subscription?.plan === 'starter' ? 'Starter' : 'Free';
  const planVariant = subscription?.plan === 'pro' ? 'primary' : subscription?.plan === 'starter' ? 'info' : 'default';

  if (subLoading) return <LoadingSpinner fullScreen />;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <GradientIcon size={44}>
            <SettingsIcon size={22} color={colors.white} strokeWidth={1.8} />
          </GradientIcon>
          <View>
            <Text style={styles.pageTitle}>Settings</Text>
            <Text style={styles.pageSubtitle}>Manage your account</Text>
          </View>
        </View>

        {/* Profile card */}
        <Card>
          <View style={styles.profileSection}>
            <LinearGradient
              colors={[...colors.gradient.primaryLight]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.avatar}
            >
              <User size={28} color={colors.primary[600]} strokeWidth={1.5} />
            </LinearGradient>
            <View style={styles.profileInfo}>
              <Text style={styles.displayName}>
                {user?.user_metadata?.display_name || 'DocuIntelli User'}
              </Text>
              <View style={styles.emailRow}>
                <Mail size={13} color={colors.slate[400]} strokeWidth={1.8} />
                <Text style={styles.email}>{user?.email ?? '—'}</Text>
              </View>
            </View>
            <Badge label={planName} variant={planVariant} />
          </View>
        </Card>

        {/* Menu items */}
        <Card padded={false}>
          {MENU_ITEMS.map((item, index) => (
            <React.Fragment key={item.route}>
              {index > 0 && <View style={styles.divider} />}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => router.push(item.route)}
                activeOpacity={0.6}
              >
                <View style={[styles.menuIconWrap, { backgroundColor: item.iconBg }]}>
                  <item.icon size={18} color={item.iconColor} strokeWidth={1.8} />
                </View>
                <View style={styles.menuContent}>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                </View>
                <ChevronRight size={18} color={colors.slate[400]} strokeWidth={1.8} />
              </TouchableOpacity>
            </React.Fragment>
          ))}
        </Card>

        {/* Sign Out */}
        <Button
          title="Sign Out"
          onPress={handleSignOut}
          variant="outline"
          size="lg"
          icon={<LogOut size={18} color={colors.slate[600]} strokeWidth={1.8} />}
          fullWidth
        />

        {/* App info */}
        <View style={styles.appInfo}>
          <Text style={styles.appVersion}>DocuIntelli AI v1.0.0</Text>
          <Text style={styles.appCopy}>Powered by Okestra AI Labs</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate[50] },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },

  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pageTitle: { fontSize: typography.fontSize['2xl'], fontWeight: typography.fontWeight.bold, color: colors.slate[900] },
  pageSubtitle: { fontSize: typography.fontSize.sm, color: colors.slate[500], marginTop: 2 },

  // Profile
  profileSection: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  profileInfo: { flex: 1 },
  displayName: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.semibold, color: colors.slate[900] },
  emailRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  email: { fontSize: typography.fontSize.sm, color: colors.slate[500] },

  // Menu
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: 14,
  },
  menuIconWrap: {
    width: 36, height: 36, borderRadius: borderRadius.lg,
    alignItems: 'center', justifyContent: 'center',
  },
  menuContent: { flex: 1 },
  menuLabel: { fontSize: typography.fontSize.base, fontWeight: typography.fontWeight.medium, color: colors.slate[900] },
  menuSubtitle: { fontSize: typography.fontSize.xs, color: colors.slate[500], marginTop: 1 },
  divider: { height: 1, backgroundColor: colors.slate[100], marginHorizontal: spacing.lg },

  // App info
  appInfo: { alignItems: 'center', paddingTop: spacing.md },
  appVersion: { fontSize: typography.fontSize.xs, color: colors.slate[400] },
  appCopy: { fontSize: typography.fontSize.xs, color: colors.slate[400], marginTop: 2 },
});
