import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Banknote, Briefcase, CircleDollarSign, Plus, X as XIcon } from 'lucide-react-native';
import type { IncomeStream } from '../../lib/financialApi';
import {
  getTagOptions,
  addIncomeStreamTag,
  removeIncomeStreamTag,
} from '../../lib/financialApi';
import CollapsibleSection from './CollapsibleSection';
import Badge from '../ui/Badge';
import TagPicker from '../ui/TagPicker';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface IncomeStreamsListProps {
  streams: IncomeStream[];
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);

export default function IncomeStreamsList({ streams }: IncomeStreamsListProps) {
  const [incomeTagOptions, setIncomeTagOptions] = useState<string[]>([]);
  const [localTags, setLocalTags] = useState<Record<string, string[]>>({});
  const [pickerStem, setPickerStem] = useState<string | null>(null);

  useEffect(() => {
    getTagOptions().then(opts => setIncomeTagOptions(opts.income_tags)).catch(() => {});
  }, []);

  // Initialize local tags from stream data
  useEffect(() => {
    const tags: Record<string, string[]> = {};
    for (const s of streams) {
      if (s.merchant_stem) {
        const userTags = s.user_tags || [];
        if (s.is_salary && !userTags.includes('Salary')) {
          tags[s.merchant_stem] = ['Salary', ...userTags];
        } else {
          tags[s.merchant_stem] = [...userTags];
        }
      }
    }
    setLocalTags(tags);
  }, [streams]);

  if (!streams.length) return null;

  const totalMonthly = streams.reduce((sum, s) => sum + s.monthly_amount, 0);

  const handleAddTag = async (stream: IncomeStream, tag: string) => {
    const stem = stream.merchant_stem;
    setLocalTags(prev => ({ ...prev, [stem]: [...(prev[stem] || []), tag] }));
    setPickerStem(null);
    try {
      const isSalaryOverride = tag === 'Salary' ? true : undefined;
      await addIncomeStreamTag(stem, tag, isSalaryOverride);
    } catch {
      setLocalTags(prev => ({ ...prev, [stem]: (prev[stem] || []).filter(t => t !== tag) }));
    }
  };

  const handleRemoveTag = async (stream: IncomeStream, tag: string) => {
    const stem = stream.merchant_stem;
    setLocalTags(prev => ({ ...prev, [stem]: (prev[stem] || []).filter(t => t !== tag) }));
    try {
      if (tag === 'Salary') {
        // Override auto-detection — keep the row with is_auto_salary_override=false
        await addIncomeStreamTag(stem, tag, false);
      } else {
        await removeIncomeStreamTag(stem, tag);
      }
    } catch { /* best effort */ }
  };

  const pickerStream = streams.find(s => s.merchant_stem === pickerStem);

  return (
    <CollapsibleSection
      icon={<Banknote size={18} color={colors.success[600]} strokeWidth={2} />}
      title="Income Streams"
      trailing={<Text style={styles.total}>{formatCurrency(totalMonthly)}/mo</Text>}
    >
      <View style={styles.list}>
        {streams.map((stream, i) => {
          const stem = stream.merchant_stem || `stream-${i}`;
          const tags = localTags[stem] || [];
          const hasSalary = tags.includes('Salary');

          return (
            <View key={`${stream.source}-${i}`} style={styles.row}>
              <View style={[styles.iconWrap, hasSalary ? styles.salaryIcon : styles.otherIcon]}>
                {hasSalary
                  ? <Briefcase size={14} color={colors.success[600]} strokeWidth={2} />
                  : <CircleDollarSign size={14} color={colors.teal[600]} strokeWidth={2} />}
              </View>
              <View style={styles.info}>
                <Text style={styles.source} numberOfLines={1}>{stream.source}</Text>
                <View style={styles.metaRow}>
                  <Badge label={stream.frequency} variant="default" />
                  {tags.map(tag => (
                    <TouchableOpacity
                      key={tag}
                      onPress={() => handleRemoveTag(stream, tag)}
                      style={styles.tagBadge}
                    >
                      <View style={[styles.tagInner, tag === 'Salary' ? styles.salaryBadge : styles.defaultBadge]}>
                        <Text style={[styles.tagText, tag === 'Salary' ? styles.salaryBadgeText : styles.defaultBadgeText]}>
                          {tag}
                        </Text>
                        <XIcon size={10} color={tag === 'Salary' ? colors.info[600] : colors.teal[600]} />
                      </View>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    onPress={() => setPickerStem(stem)}
                    style={styles.addButton}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Plus size={12} color={colors.slate[400]} />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.amount}>{formatCurrency(stream.monthly_amount)}/mo</Text>
            </View>
          );
        })}
      </View>

      <TagPicker
        visible={!!pickerStem}
        title="Label Income"
        options={incomeTagOptions}
        existingTags={pickerStem ? (localTags[pickerStem] || []) : []}
        onSelect={(tag) => pickerStream && handleAddTag(pickerStream, tag)}
        onClose={() => setPickerStem(null)}
      />
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
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  amount: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  tagBadge: {
    // wrapper for touchable
  },
  tagInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  salaryBadge: {
    backgroundColor: colors.info[50],
    borderColor: colors.info[200],
  },
  defaultBadge: {
    backgroundColor: colors.teal[50],
    borderColor: colors.teal[200],
  },
  tagText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  salaryBadgeText: {
    color: colors.info[700],
  },
  defaultBadgeText: {
    color: colors.teal[700],
  },
  addButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.slate[50],
  },
});
