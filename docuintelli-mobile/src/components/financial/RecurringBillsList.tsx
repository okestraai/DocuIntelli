import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Receipt, CalendarClock } from 'lucide-react-native';
import type { RecurringBill } from '../../lib/financialApi';
import CollapsibleSection from './CollapsibleSection';
import Badge from '../ui/Badge';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface RecurringBillsListProps {
  bills: RecurringBill[];
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RecurringBillsList({ bills }: RecurringBillsListProps) {
  if (!bills.length) return null;

  const total = bills.reduce((sum, b) => sum + b.amount, 0);

  return (
    <CollapsibleSection
      icon={<Receipt size={18} color={colors.primary[600]} strokeWidth={2} />}
      title="Recurring Bills"
      trailing={<Text style={styles.total}>{formatCurrency(total)}/mo</Text>}
    >
      <View style={styles.list}>
        {bills.slice(0, 10).map((bill, i) => (
          <View key={`${bill.name}-${i}`} style={styles.row}>
            <View style={styles.billInfo}>
              <Text style={styles.billName} numberOfLines={1}>{bill.name}</Text>
              <View style={styles.metaRow}>
                <Badge label={bill.frequency} variant="default" />
                {bill.next_expected && (
                  <View style={styles.nextDate}>
                    <CalendarClock size={12} color={colors.slate[400]} strokeWidth={2} />
                    <Text style={styles.nextDateText}>Next: {formatDate(bill.next_expected)}</Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={styles.billAmount}>{formatCurrency(bill.amount)}</Text>
          </View>
        ))}
      </View>
    </CollapsibleSection>
  );
}

const styles = StyleSheet.create({
  total: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.primary[600],
  },
  list: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
  },
  billInfo: {
    flex: 1,
    marginRight: spacing.md,
    gap: spacing.xs,
  },
  billName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[800],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  nextDate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  nextDateText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
  },
  billAmount: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
});
