import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { borderRadius, spacing } from '../../theme/spacing';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
}

const variantConfig: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  default: { bg: colors.slate[100], text: colors.slate[700], border: colors.slate[200] },
  primary: { bg: colors.primary[50], text: colors.primary[700], border: colors.primary[200] },
  success: { bg: colors.success[50], text: colors.success[700], border: colors.success[200] },
  warning: { bg: colors.warning[50], text: colors.warning[700], border: colors.warning[200] },
  error: { bg: colors.error[50], text: colors.error[700], border: colors.error[200] },
  info: { bg: colors.info[50], text: colors.info[700], border: colors.info[200] },
};

export default function Badge({ label, variant = 'default', style }: BadgeProps) {
  const config = variantConfig[variant];
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: config.bg, borderColor: config.border },
        style,
      ]}
    >
      <Text style={[styles.text, { color: config.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
});
