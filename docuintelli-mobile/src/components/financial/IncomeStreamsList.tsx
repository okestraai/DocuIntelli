import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Banknote, Briefcase, CircleDollarSign } from 'lucide-react-native';
import type { IncomeStream } from '../../lib/financialApi';
import CollapsibleSection from './CollapsibleSection';
import Badge from '../ui/Badge';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface IncomeStreamsListProps {
  streams: IncomeStream[];
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

export default function IncomeStreamsList({ streams }: IncomeStreamsListProps) {
  if (!streams.length) return null;

  const totalMonthly = streams.reduce((sum, s) => sum + s.average_amount, 0);

  return (
    <CollapsibleSection
      icon={<Banknote size={18} color={colors.success[600]} strokeWidth={2} />}
      title="Income Streams"
      trailing={<Text style={styles.total}>{formatCurrency(totalMonthly)}/mo</Text>}
    >
      <View style={styles.list}>
        {streams.map((stream, i) => (
          <View key={`${stream.source}-${i}`} style={styles.row}>
            <View style={[styles.iconWrap, stream.is_salary ? styles.salaryIcon : styles.otherIcon]}>
              {stream.is_salary
                ? <Briefcase size={14} color={colors.success[600]} strokeWidth={2} />
                : <CircleDollarSign size={14} color={colors.teal[600]} strokeWidth={2} />}
            </View>
            <View style={styles.info}>
              <Text style={styles.source} numberOfLines={1}>{stream.source}</Text>
              <View style={styles.metaRow}>
                <Badge label={stream.frequency} variant="default" />
                {stream.is_salary && <Badge label="Salary" variant="success" />}
              </View>
            </View>
            <Text style={styles.amount}>{formatCurrency(stream.average_amount)}</Text>
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
    color: colors.success[600],
  },
  list: {
    gap: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[100],
    gap: spacing.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  salaryIcon: {
    backgroundColor: colors.success[50],
  },
  otherIcon: {
    backgroundColor: colors.teal[50],
  },
  info: {
    flex: 1,
    gap: spacing.xs,
  },
  source: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[800],
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  amount: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
});
