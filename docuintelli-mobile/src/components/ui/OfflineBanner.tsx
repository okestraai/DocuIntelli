import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { WifiOff } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '../../store/appStore';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

export default function OfflineBanner() {
  const isOnline = useAppStore((s) => s.isOnline);
  const insets = useSafeAreaInsets();

  if (isOnline) return null;

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.content}>
        <WifiOff size={16} color={colors.warning[800]} strokeWidth={2} />
        <Text style={styles.text}>You're offline. Some features may be unavailable.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.warning[100],
    borderBottomWidth: 1,
    borderBottomColor: colors.warning[200],
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    zIndex: 100,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  text: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.warning[800],
  },
});
