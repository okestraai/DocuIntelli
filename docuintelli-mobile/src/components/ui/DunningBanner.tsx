import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CreditCard, AlertTriangle, Clock, Trash2, X } from 'lucide-react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { getCustomerPortalUrl } from '../../lib/subscriptionApi';
import { API_BASE } from '../../lib/config';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

interface DunningStatus {
  inDunning: boolean;
  paymentStatus: 'active' | 'past_due' | 'restricted' | 'downgraded';
  dunningStep: number;
  paymentFailedAt: string | null;
  restrictedAt: string | null;
  downgradeDate: string | null;
  deletionDate: string | null;
  previousPlan: string | null;
}

export default function DunningBanner() {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<DunningStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);

  useEffect(() => {
    fetchDunningStatus();
  }, []);

  const fetchDunningStatus = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch(`${API_BASE}/api/dunning/status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setStatus(data);
        }
      }
    } catch {
      // Silently fail — banner is non-critical
    }
  };

  const handleOpenStripePortal = async () => {
    setOpeningPortal(true);
    try {
      const url = await getCustomerPortalUrl();
      await Linking.openURL(url);
    } catch {
      // Fallback to billing page
      router.navigate('/billing');
    } finally {
      setOpeningPortal(false);
    }
  };

  const handleNavigatePricing = () => {
    router.navigate('/billing');
  };

  if (!status || !status.inDunning || dismissed) return null;

  const { paymentStatus, dunningStep, deletionDate } = status;

  let bgColor: string;
  let borderColor: string;
  let textColor: string;
  let IconComponent: typeof CreditCard;
  let iconColor: string;
  let title: string;
  let message: string;
  let actionText: string;
  let onAction: () => void;
  let btnBgColor: string;

  if (paymentStatus === 'past_due') {
    bgColor = colors.warning[50];
    borderColor = colors.warning[200];
    textColor = colors.warning[800];
    iconColor = colors.warning[600];
    IconComponent = CreditCard;
    title = 'Payment Issue';
    message = "We couldn't process your payment. We'll keep retrying automatically.";
    actionText = 'Update Card';
    onAction = handleOpenStripePortal;
    btnBgColor = colors.warning[600];
  } else if (paymentStatus === 'restricted') {
    bgColor = '#fff7ed'; // orange-50
    borderColor = '#fed7aa'; // orange-200
    textColor = '#9a3412'; // orange-800
    iconColor = '#ea580c'; // orange-600
    IconComponent = AlertTriangle;
    title = 'Account Restricted';
    message = 'Your account is restricted due to unpaid balance. Uploads and AI chat are disabled.';
    actionText = 'Update Card';
    onAction = handleOpenStripePortal;
    btnBgColor = '#ea580c';
  } else if (paymentStatus === 'downgraded') {
    bgColor = colors.error[50];
    borderColor = colors.error[200];
    textColor = colors.error[800];
    iconColor = colors.error[600];
    btnBgColor = colors.error[600];

    if (dunningStep >= 7 && deletionDate) {
      const delDate = new Date(deletionDate).toLocaleDateString('en-US', { dateStyle: 'medium' });
      IconComponent = Trash2;
      title = 'Documents Will Be Deleted';
      message = `Excess documents will be permanently deleted on ${delDate}. Resubscribe to prevent this.`;
      actionText = 'Resubscribe';
      onAction = handleNavigatePricing;
    } else {
      IconComponent = Clock;
      title = 'Plan Downgraded';
      message = 'Your plan was downgraded to Free due to non-payment.';
      actionText = 'Resubscribe';
      onAction = handleNavigatePricing;
    }
  } else {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: bgColor, borderBottomColor: borderColor }]}>
      <View style={styles.content}>
        <IconComponent size={18} color={iconColor} strokeWidth={2} />
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: textColor }]}>{title}</Text>
          <Text style={[styles.message, { color: textColor }]} numberOfLines={2}>{message}</Text>
        </View>
        <TouchableOpacity
          onPress={onAction}
          disabled={openingPortal}
          style={[styles.actionBtn, { backgroundColor: btnBgColor, opacity: openingPortal ? 0.6 : 1 }]}
          activeOpacity={0.7}
        >
          {openingPortal ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.actionBtnText}>{actionText}</Text>
          )}
        </TouchableOpacity>
        {paymentStatus === 'past_due' && (
          <TouchableOpacity onPress={() => setDismissed(true)} hitSlop={8}>
            <X size={16} color={colors.warning[500]} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    zIndex: 100,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
  },
  message: {
    fontSize: typography.fontSize.xs,
    opacity: 0.8,
    lineHeight: 16,
  },
  actionBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    color: colors.white,
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
  },
});
