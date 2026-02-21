import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import Card from '../ui/Card';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface CollapsibleSectionProps {
  icon: React.ReactNode;
  title: string;
  /** Right-side accessory (e.g. totals) shown next to chevron */
  trailing?: React.ReactNode;
  /** Start expanded */
  defaultExpanded?: boolean;
  children: React.ReactNode;
}

export default function CollapsibleSection({
  icon,
  title,
  trailing,
  defaultExpanded = false,
  children,
}: CollapsibleSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <Card>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        {icon}
        <Text style={styles.title}>{title}</Text>
        <View style={styles.trailing}>
          {trailing}
          {expanded
            ? <ChevronUp size={18} color={colors.slate[400]} strokeWidth={2} />
            : <ChevronDown size={18} color={colors.slate[400]} strokeWidth={2} />}
        </View>
      </TouchableOpacity>

      {expanded && <View style={styles.content}>{children}</View>}
    </Card>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  content: {
    marginTop: spacing.md,
  },
});
