import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet, type ViewStyle } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface LoadingSpinnerProps {
  size?: 'small' | 'large';
  color?: string;
  fullScreen?: boolean;
  style?: ViewStyle;
  /** Show branded splash for app-level loading */
  branded?: boolean;
}

export default function LoadingSpinner({
  size = 'large',
  color = colors.primary[600],
  fullScreen = false,
  style,
  branded = false,
}: LoadingSpinnerProps) {
  if (fullScreen) {
    return (
      <View style={[styles.fullScreen, style]}>
        {branded && (
          <View style={styles.brandWrap}>
            <ShieldCheck size={36} color={colors.primary[600]} strokeWidth={1.5} />
            <Text style={styles.brandText}>DocuIntelli AI</Text>
          </View>
        )}
        <ActivityIndicator size={size} color={color} />
      </View>
    );
  }

  return <ActivityIndicator size={size} color={color} style={style} />;
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.white,
  },
  brandWrap: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  brandText: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
    marginTop: spacing.sm,
  },
});
