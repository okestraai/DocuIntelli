import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../../theme/colors';
import { borderRadius } from '../../theme/spacing';

interface GradientIconProps {
  children: React.ReactNode;
  size?: number;
  /** Light version uses primary-50 to teal-50 */
  light?: boolean;
}

/**
 * Matches the web's gradient icon container:
 * bg-gradient-to-br from-emerald-600 to-teal-600 p-2 rounded-xl
 */
export default function GradientIcon({ children, size = 40, light = false }: GradientIconProps) {
  return (
    <LinearGradient
      colors={light ? [...colors.gradient.primaryLight] : [...colors.gradient.primary]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.container,
        {
          width: size,
          height: size,
          borderRadius: size > 36 ? borderRadius.xl : borderRadius.lg,
        },
      ]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
