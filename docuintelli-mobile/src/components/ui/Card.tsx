import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../../theme/colors';
import { borderRadius, spacing } from '../../theme/spacing';

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  /** Removes border and shadow for transparent/embedded cards */
  flat?: boolean;
}

export default function Card({ children, style, padded = true, flat = false }: CardProps) {
  return (
    <View style={[styles.card, !flat && styles.elevated, padded && styles.padded, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    overflow: 'hidden',
  },
  elevated: {
    borderWidth: 1,
    borderColor: colors.slate[200],
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  padded: {
    padding: spacing.lg,
  },
});
