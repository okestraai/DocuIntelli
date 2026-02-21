import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Building2, RefreshCw, Unlink } from 'lucide-react-native';
import CollapsibleSection from './CollapsibleSection';
import Badge from '../ui/Badge';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing, borderRadius } from '../../theme/spacing';

interface ConnectedAccountsListProps {
  accounts: any[];
  syncing: boolean;
  onSync: (itemId: string) => void;
  onDisconnect: (itemId: string) => void;
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

export default function ConnectedAccountsList({
  accounts,
  syncing,
  onSync,
  onDisconnect,
}: ConnectedAccountsListProps) {
  if (!accounts.length) return null;

  const confirmDisconnect = (itemId: string, name: string) => {
    Alert.alert(
      'Disconnect Account',
      `Remove ${name} and all associated data? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Disconnect', style: 'destructive', onPress: () => onDisconnect(itemId) },
      ],
    );
  };

  return (
    <CollapsibleSection
      icon={<Building2 size={18} color={colors.primary[600]} strokeWidth={2} />}
      title={`Connected Accounts (${accounts.length})`}
    >
      <View style={styles.list}>
        {accounts.map((item: any) => (
          <View key={item.item_id} style={styles.itemCard}>
            <View style={styles.institutionRow}>
              <Text style={styles.institutionName} numberOfLines={1}>
                {item.institution_name || 'Bank Account'}
              </Text>
              <View style={styles.actions}>
                <TouchableOpacity
                  onPress={() => onSync(item.item_id)}
                  disabled={syncing}
                  style={styles.actionBtn}
                  activeOpacity={0.7}
                >
                  <RefreshCw
                    size={14}
                    color={syncing ? colors.slate[300] : colors.primary[600]}
                    strokeWidth={2}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => confirmDisconnect(item.item_id, item.institution_name)}
                  style={styles.actionBtn}
                  activeOpacity={0.7}
                >
                  <Unlink size={14} color={colors.error[500]} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            </View>

            {item.accounts?.map((acc: any) => (
              <View key={acc.account_id} style={styles.accountRow}>
                <View style={styles.accountInfo}>
                  <Text style={styles.accountName} numberOfLines={1}>
                    {acc.name}
                  </Text>
                  <Badge
                    label={`${acc.type}${acc.mask ? ` ••${acc.mask}` : ''}`}
                    variant="default"
                  />
                </View>
                <Text style={styles.balance}>
                  {formatCurrency(acc.current_balance ?? 0)}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
    </CollapsibleSection>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
  itemCard: {
    backgroundColor: colors.slate[50],
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  institutionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  institutionName: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[800],
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  accountInfo: {
    flex: 1,
    gap: spacing.xs,
    marginRight: spacing.sm,
  },
  accountName: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[700],
  },
  balance: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
});
