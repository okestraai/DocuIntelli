import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { borderRadius, spacing } from '../../theme/spacing';

interface UsageBarProps {
  label: string;
  used: number;
  limit: number;
  isUnlimited?: boolean;
  icon?: React.ReactNode;
}

export default function UsageBar({ label, used, limit, isUnlimited = false, icon }: UsageBarProps) {
  const percentage = isUnlimited ? 0 : limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const remaining = limit - used;
  const isAtLimit = !isUnlimited && remaining <= 0;
  const isNearLimit = !isUnlimited && !isAtLimit && percentage >= 70;

  // Determine gradient colors based on usage percentage
  const getBarGradient = (): readonly [string, string] => {
    if (percentage >= 90) return colors.gradient.danger;
    if (percentage >= 70) return [colors.warning[500], colors.warning[600]] as const;
    return colors.gradient.primary;
  };

  const barGradient = getBarGradient();

  return (
    <View style={styles.container}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.labelRow}>
          {icon && <View style={styles.icon}>{icon}</View>}
          <Text style={styles.label}>{label}</Text>
        </View>
        <Text style={styles.count}>
          {isUnlimited ? (
            'Unlimited'
          ) : (
            `${used}/${limit}`
          )}
        </Text>
      </View>

      {/* Progress bar */}
      <View style={styles.barContainer}>
        {percentage > 0 && (
          <LinearGradient
            colors={[...barGradient]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.barFill, { width: `${percentage}%` }]}
          />
        )}
      </View>

      {/* Status text */}
      {!isUnlimited && isAtLimit && (
        <Text style={styles.limitReached}>Limit reached</Text>
      )}
      {!isUnlimited && isNearLimit && !isAtLimit && (
        <Text style={styles.nearLimit}>{remaining} remaining</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  icon: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[700],
  },
  count: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[500],
  },
  barContainer: {
    height: 8,
    borderRadius: borderRadius.full,
    backgroundColor: colors.slate[100],
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  limitReached: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.error[600],
  },
  nearLimit: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.normal,
    color: colors.slate[500],
  },
});
