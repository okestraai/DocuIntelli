import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Target, AlertCircle, ArrowUpCircle, MinusCircle } from 'lucide-react-native';
import type { ActionItem } from '../../lib/financialApi';
import CollapsibleSection from './CollapsibleSection';
import Badge from '../ui/Badge';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface ActionPlanSectionProps {
  items: ActionItem[];
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

const PRIORITY_CONFIG: Record<string, { variant: 'error' | 'warning' | 'info'; icon: React.ReactNode; label: string }> = {
  high: {
    variant: 'error',
    icon: <AlertCircle size={14} color={colors.error[600]} strokeWidth={2} />,
    label: 'High',
  },
  medium: {
    variant: 'warning',
    icon: <ArrowUpCircle size={14} color={colors.warning[600]} strokeWidth={2} />,
    label: 'Medium',
  },
  low: {
    variant: 'info',
    icon: <MinusCircle size={14} color={colors.info[600]} strokeWidth={2} />,
    label: 'Low',
  },
};

export default function ActionPlanSection({ items }: ActionPlanSectionProps) {
  if (!items.length) return null;

  return (
    <CollapsibleSection
      icon={<Target size={18} color={colors.primary[600]} strokeWidth={2} />}
      title="30-Day Action Plan"
    >
      <View style={styles.list}>
        {items.map((item, i) => {
          const config = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.low;
          return (
            <View key={i} style={styles.item}>
              <View style={styles.itemHeader}>
                {config.icon}
                <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
                <Badge label={config.label} variant={config.variant} />
              </View>
              <Text style={styles.itemDescription}>{item.description}</Text>
              {item.potential_savings != null && item.potential_savings > 0 && (
                <Text style={styles.savings}>
                  Potential savings: {formatCurrency(item.potential_savings)}/mo
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </CollapsibleSection>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  item: {
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
    gap: spacing.xs,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  itemTitle: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
  },
  itemDescription: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[600],
    lineHeight: 20,
    paddingLeft: spacing.xl,
  },
  savings: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[600],
    paddingLeft: spacing.xl,
  },
});
