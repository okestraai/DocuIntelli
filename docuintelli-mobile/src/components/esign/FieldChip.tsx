import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { Check, Pen } from 'lucide-react-native';
import { colors } from '../../theme/colors';
import { FIELD_TYPE_LABELS, SIGNER_COLORS } from '../../types/esignature';
import type { FieldType } from '../../types/esignature';

interface FieldChipProps {
  fieldType: FieldType;
  label?: string | null;
  isFilled: boolean;
  signerIndex?: number;
  onPress: () => void;
  style?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  mode: 'signing' | 'placement';
  /** Show delete button in placement mode */
  onDelete?: () => void;
}

export default function FieldChip({
  fieldType,
  label,
  isFilled,
  signerIndex = 0,
  onPress,
  style,
  mode,
  onDelete,
}: FieldChipProps) {
  const signerColor = SIGNER_COLORS[signerIndex % SIGNER_COLORS.length];
  const displayLabel = label || FIELD_TYPE_LABELS[fieldType] || fieldType;

  const borderColor = mode === 'placement'
    ? signerColor
    : isFilled
      ? colors.primary[500]
      : colors.warning[500];

  const bgColor = mode === 'placement'
    ? `${signerColor}20`
    : isFilled
      ? colors.primary[50]
      : colors.warning[50];

  return (
    <TouchableOpacity
      style={[
        styles.chip,
        { borderColor, backgroundColor: bgColor },
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        {isFilled && mode === 'signing' ? (
          <Check size={10} color={colors.primary[600]} />
        ) : mode === 'signing' ? (
          <Pen size={10} color={colors.warning[600]} />
        ) : null}
        <Text
          style={[styles.label, { color: mode === 'placement' ? signerColor : isFilled ? colors.primary[700] : colors.warning[700] }]}
          numberOfLines={1}
        >
          {displayLabel}
        </Text>
      </View>

      {mode === 'placement' && onDelete && (
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={(e) => { e.stopPropagation?.(); onDelete(); }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.deleteText}>×</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    position: 'absolute',
    borderWidth: 1.5,
    borderRadius: 3,
    justifyContent: 'center',
    overflow: 'visible',
    minWidth: 20,
    minHeight: 14,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  label: {
    fontSize: 8,
    fontWeight: '600',
  },
  deleteBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.error[500],
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
});
