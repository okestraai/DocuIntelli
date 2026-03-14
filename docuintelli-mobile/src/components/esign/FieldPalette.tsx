import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import {
  Pen,
  User,
  AtSign,
  Calendar,
  Type,
  CheckSquare,
  Briefcase,
  Building2,
  FileText,
} from 'lucide-react-native';
import { colors } from '../../theme/colors';
import { spacing, borderRadius } from '../../theme/spacing';
import type { FieldType } from '../../types/esignature';

interface FieldPaletteProps {
  selectedFieldType: FieldType | null;
  onSelectFieldType: (type: FieldType | null) => void;
}

const FIELD_TYPES: { type: FieldType; label: string; icon: typeof Pen }[] = [
  { type: 'signature', label: 'Signature', icon: Pen },
  { type: 'full_name', label: 'Full Name', icon: User },
  { type: 'initials', label: 'Initials', icon: AtSign },
  { type: 'date_signed', label: 'Date', icon: Calendar },
  { type: 'text_field', label: 'Text', icon: Type },
  { type: 'checkbox', label: 'Check', icon: CheckSquare },
  { type: 'title_role', label: 'Title', icon: Briefcase },
  { type: 'company_name', label: 'Company', icon: Building2 },
  { type: 'custom_text', label: 'Custom', icon: FileText },
];

export default function FieldPalette({ selectedFieldType, onSelectFieldType }: FieldPaletteProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {FIELD_TYPES.map(({ type, label, icon: Icon }) => {
        const isSelected = selectedFieldType === type;
        return (
          <TouchableOpacity
            key={type}
            style={[styles.chip, isSelected && styles.chipActive]}
            onPress={() => onSelectFieldType(isSelected ? null : type)}
            activeOpacity={0.7}
          >
            <Icon
              size={14}
              color={isSelected ? colors.primary[600] : colors.slate[500]}
            />
            <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
  },
  chipActive: {
    borderColor: colors.primary[400],
    backgroundColor: colors.primary[50],
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.slate[500],
  },
  chipTextActive: {
    color: colors.primary[700],
  },
});
