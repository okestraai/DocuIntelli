import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface ConfirmModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  loading?: boolean;
  requiresConfirmText?: string;
}

export default function ConfirmModal({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  loading = false,
  requiresConfirmText,
}: ConfirmModalProps) {
  const [confirmInput, setConfirmInput] = useState('');

  // Reset input when modal opens/closes
  useEffect(() => {
    if (!visible) {
      setConfirmInput('');
    }
  }, [visible]);

  const isConfirmDisabled = requiresConfirmText
    ? confirmInput !== requiresConfirmText
    : false;

  return (
    <Modal visible={visible} onClose={onClose} title={title}>
      <View style={styles.content}>
        <Text style={styles.message}>{message}</Text>

        {requiresConfirmText && (
          <View style={styles.confirmInputContainer}>
            <Text style={styles.confirmHint}>
              Type "{requiresConfirmText}" to confirm
            </Text>
            <Input
              value={confirmInput}
              onChangeText={setConfirmInput}
              placeholder={requiresConfirmText}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        <View style={styles.buttonRow}>
          <Button
            title="Cancel"
            onPress={onClose}
            variant="outline"
            style={styles.button}
            disabled={loading}
          />
          <Button
            title={confirmLabel}
            onPress={onConfirm}
            variant={confirmVariant === 'danger' ? 'danger' : 'primary'}
            style={styles.button}
            disabled={isConfirmDisabled}
            loading={loading}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  message: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.normal,
    color: colors.slate[600],
    lineHeight: typography.fontSize.base * typography.lineHeight.normal,
  },
  confirmInputContainer: {
    gap: spacing.sm,
  },
  confirmHint: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[500],
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  button: {
    flex: 1,
  },
});
