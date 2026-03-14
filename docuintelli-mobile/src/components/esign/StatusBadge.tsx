import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../../theme/colors';
import { borderRadius } from '../../theme/spacing';
import type { RequestStatus, SignerStatus } from '../../types/esignature';

type BadgeStatus = RequestStatus | SignerStatus;

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: colors.slate[100], text: colors.slate[600], label: 'Draft' },
  pending: { bg: colors.warning[100], text: colors.warning[700], label: 'Pending' },
  notified: { bg: colors.info[100], text: colors.info[700], label: 'Notified' },
  viewed: { bg: colors.info[100], text: colors.info[700], label: 'Viewed' },
  signed: { bg: colors.success[100], text: colors.success[700], label: 'Signed' },
  completed: { bg: colors.success[100], text: colors.success[700], label: 'Completed' },
  voided: { bg: colors.error[100], text: colors.error[700], label: 'Voided' },
  expired: { bg: colors.slate[100], text: colors.slate[600], label: 'Expired' },
  declined: { bg: colors.error[100], text: colors.error[700], label: 'Declined' },
};

interface StatusBadgeProps {
  status: BadgeStatus;
  size?: 'sm' | 'md';
}

export default function StatusBadge({ status, size = 'sm' }: StatusBadgeProps) {
  const config = STATUS_STYLES[status] || STATUS_STYLES.pending;

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }, size === 'md' && styles.badgeMd]}>
      <Text style={[styles.text, { color: config.text }, size === 'md' && styles.textMd]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  badgeMd: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  text: {
    fontSize: 11,
    fontWeight: '600',
  },
  textMd: {
    fontSize: 13,
  },
});
