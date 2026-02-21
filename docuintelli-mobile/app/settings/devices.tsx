import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import {
  Smartphone, Monitor, Tablet, X, Info, ShieldCheck,
} from 'lucide-react-native';
import Card from '../../src/components/ui/Card';
import Badge from '../../src/components/ui/Badge';
import GradientIcon from '../../src/components/ui/GradientIcon';
import LoadingSpinner from '../../src/components/ui/LoadingSpinner';
import { useToast } from '../../src/contexts/ToastContext';
import {
  listDevices, removeDevice, formatRelativeTime,
  type UserDevice,
} from '../../src/lib/devicesApi';
import { getDeviceId } from '../../src/lib/deviceId';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { spacing, borderRadius } from '../../src/theme/spacing';

export default function DevicesScreen() {
  const { showToast } = useToast();
  const [devices, setDevices] = useState<UserDevice[]>([]);
  const [deviceLimit, setDeviceLimit] = useState(1);
  const [currentDeviceId, setCurrentDeviceId] = useState<string | null>(null);
  const [localDeviceId, setLocalDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    try {
      const data = await listDevices();
      setDevices(data.devices);
      setDeviceLimit(data.limit);
      setCurrentDeviceId(data.current_device_id);
    } catch (err: any) {
      showToast(err?.message || 'Failed to load devices', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
    getDeviceId().then(setLocalDeviceId);
  }, []);

  const handleRemove = (device: UserDevice) => {
    Alert.alert(
      'Remove Device',
      `Remove "${device.device_name || 'Unknown device'}" from your account? This device will need to re-authenticate.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingId(device.id);
            try {
              await removeDevice(device.id);
              showToast('Device removed', 'success');
              await loadDevices();
            } catch (err: any) {
              showToast(err?.message || 'Failed to remove device', 'error');
            } finally {
              setRemovingId(null);
            }
          },
        },
      ],
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadDevices();
  };

  const activeCount = devices.filter(d => !d.is_blocked).length;

  const getDeviceIcon = (platform: string, isBlocked: boolean, isCurrent: boolean) => {
    const color = isBlocked
      ? colors.error[500]
      : isCurrent
        ? colors.primary[600]
        : colors.slate[500];

    if (platform.includes('ios') || platform === 'mobile') {
      return <Smartphone size={20} color={color} strokeWidth={1.8} />;
    }
    if (platform.includes('android')) {
      return <Tablet size={20} color={color} strokeWidth={1.8} />;
    }
    return <Monitor size={20} color={color} strokeWidth={1.8} />;
  };

  if (loading) return <LoadingSpinner fullScreen />;

  return (
    <>
      <Stack.Screen options={{ title: 'Connected Devices', headerShown: true }} />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary[600]} />
          }
        >
          {/* Header summary */}
          <Card style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <GradientIcon size={44}>
                <Smartphone size={22} color={colors.white} strokeWidth={1.8} />
              </GradientIcon>
              <View style={styles.summaryInfo}>
                <Text style={styles.summaryTitle}>Connected Devices</Text>
                <Text style={styles.summarySubtitle}>
                  Using {activeCount} of {deviceLimit} device{deviceLimit !== 1 ? 's' : ''}
                </Text>
              </View>
              <Badge label={`${activeCount}/${deviceLimit}`} variant="primary" />
            </View>
          </Card>

          {/* Device list */}
          <Card padded={false}>
            {devices.length === 0 ? (
              <View style={styles.emptyState}>
                <Smartphone size={32} color={colors.slate[300]} strokeWidth={1.5} />
                <Text style={styles.emptyTitle}>No devices registered</Text>
                <Text style={styles.emptyText}>
                  Devices are registered automatically when you use the app
                </Text>
              </View>
            ) : (
              devices.map((device, index) => {
                const isCurrent = device.device_id === (currentDeviceId || localDeviceId);
                return (
                  <View key={device.id}>
                    {index > 0 && <View style={styles.divider} />}
                    <View style={styles.deviceRow}>
                      {/* Icon */}
                      <View style={[
                        styles.deviceIconWrap,
                        device.is_blocked
                          ? styles.deviceIconBlocked
                          : isCurrent
                            ? styles.deviceIconCurrent
                            : styles.deviceIconDefault,
                      ]}>
                        {getDeviceIcon(device.platform, device.is_blocked, isCurrent)}
                      </View>

                      {/* Info */}
                      <View style={styles.deviceInfo}>
                        <View style={styles.deviceNameRow}>
                          <Text style={styles.deviceName} numberOfLines={1}>
                            {device.device_name || 'Unknown device'}
                          </Text>
                          {isCurrent && (
                            <View style={styles.currentBadge}>
                              <Text style={styles.currentBadgeText}>This device</Text>
                            </View>
                          )}
                          {device.is_blocked && (
                            <View style={styles.blockedBadge}>
                              <Text style={styles.blockedBadgeText}>Blocked</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.deviceMeta}>
                          Last active {formatRelativeTime(device.last_active_at)}
                        </Text>
                      </View>

                      {/* Remove button */}
                      {!isCurrent && (
                        <TouchableOpacity
                          style={styles.removeBtn}
                          onPress={() => handleRemove(device)}
                          disabled={removingId === device.id}
                          activeOpacity={0.6}
                          hitSlop={8}
                        >
                          {removingId === device.id ? (
                            <ActivityIndicator size="small" color={colors.error[500]} />
                          ) : (
                            <X size={16} color={colors.error[500]} strokeWidth={2} />
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )}
          </Card>

          {/* Info card */}
          <Card style={styles.infoCard}>
            <View style={styles.infoRow}>
              <Info size={18} color={colors.info[600]} strokeWidth={2} />
              <View style={styles.infoContent}>
                <Text style={styles.infoTitle}>About device limits</Text>
                <Text style={styles.infoText}>
                  Your plan supports up to {deviceLimit} device{deviceLimit !== 1 ? 's' : ''}. Devices inactive for 30 days are automatically removed. If you reach your limit, the least recently used device will be blocked.
                </Text>
              </View>
            </View>
          </Card>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.slate[50] },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl },

  // Summary
  summaryCard: {},
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  summaryInfo: { flex: 1 },
  summaryTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  summarySubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    marginTop: 2,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[500],
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[400],
    textAlign: 'center',
    maxWidth: 250,
  },

  // Device rows
  divider: { height: 1, backgroundColor: colors.slate[100], marginHorizontal: spacing.lg },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  deviceIconWrap: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceIconDefault: { backgroundColor: colors.slate[50] },
  deviceIconCurrent: { backgroundColor: colors.primary[50] },
  deviceIconBlocked: { backgroundColor: colors.error[50] },

  deviceInfo: { flex: 1, minWidth: 0 },
  deviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  deviceName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
    flexShrink: 1,
  },
  currentBadge: {
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[200],
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  currentBadgeText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[700],
  },
  blockedBadge: {
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[200],
    borderRadius: borderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  blockedBadgeText: {
    fontSize: 10,
    fontWeight: typography.fontWeight.semibold,
    color: colors.error[700],
  },
  deviceMeta: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    marginTop: 2,
  },

  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.error[50],
  },

  // Info card
  infoCard: {
    backgroundColor: colors.info[50],
    borderWidth: 1,
    borderColor: colors.info[200],
  },
  infoRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  infoContent: { flex: 1 },
  infoTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.info[800],
    marginBottom: 4,
  },
  infoText: {
    fontSize: typography.fontSize.xs,
    color: colors.info[700],
    lineHeight: 18,
  },
});
