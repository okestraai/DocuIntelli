import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Linking } from 'react-native';
import * as StoreReview from 'expo-store-review';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Star } from 'lucide-react-native';
import Modal from './Modal';
import Button from './Button';
import { colors } from '../../theme/colors';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

const REVIEW_STORAGE_KEY = 'docuintelli_review_prompt';
const MIN_DAYS = 7;
const MIN_DOCUMENTS = 3;
const COOLDOWN_DAYS = 90;
const MAX_DISMISSALS = 2;

interface ReviewState {
  firstUseDate: string;
  lastPromptDate: string | null;
  dismissCount: number;
  hasReviewed: boolean;
}

interface ReviewPromptProps {
  documentCount: number;
}

export default function ReviewPrompt({ documentCount }: ReviewPromptProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    checkShouldPrompt();
  }, [documentCount]);

  const checkShouldPrompt = async () => {
    try {
      const raw = await AsyncStorage.getItem(REVIEW_STORAGE_KEY);
      let state: ReviewState;

      if (!raw) {
        // First time — record first use date
        state = {
          firstUseDate: new Date().toISOString(),
          lastPromptDate: null,
          dismissCount: 0,
          hasReviewed: false,
        };
        await AsyncStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(state));
        return;
      }

      state = JSON.parse(raw);

      // Already reviewed or too many dismissals
      if (state.hasReviewed || state.dismissCount >= MAX_DISMISSALS) return;

      // Check days since first use
      const daysSinceFirstUse = Math.floor(
        (Date.now() - new Date(state.firstUseDate).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceFirstUse < MIN_DAYS) return;

      // Check document count
      if (documentCount < MIN_DOCUMENTS) return;

      // Check cooldown
      if (state.lastPromptDate) {
        const daysSinceLastPrompt = Math.floor(
          (Date.now() - new Date(state.lastPromptDate).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceLastPrompt < COOLDOWN_DAYS) return;
      }

      // Show prompt
      setVisible(true);
      await AsyncStorage.setItem(
        REVIEW_STORAGE_KEY,
        JSON.stringify({ ...state, lastPromptDate: new Date().toISOString() })
      );
    } catch {
      // Silently fail
    }
  };

  const handleRate = async () => {
    setVisible(false);
    try {
      const isAvailable = await StoreReview.isAvailableAsync();
      if (isAvailable) {
        await StoreReview.requestReview();
      }
      const raw = await AsyncStorage.getItem(REVIEW_STORAGE_KEY);
      if (raw) {
        const state = JSON.parse(raw);
        await AsyncStorage.setItem(
          REVIEW_STORAGE_KEY,
          JSON.stringify({ ...state, hasReviewed: true })
        );
      }
    } catch {
      // Silently fail
    }
  };

  const handleFeedback = () => {
    setVisible(false);
    Linking.openURL('mailto:support@docuintelli.com?subject=App%20Feedback');
  };

  const handleDismiss = async () => {
    setVisible(false);
    try {
      const raw = await AsyncStorage.getItem(REVIEW_STORAGE_KEY);
      if (raw) {
        const state = JSON.parse(raw);
        await AsyncStorage.setItem(
          REVIEW_STORAGE_KEY,
          JSON.stringify({ ...state, dismissCount: state.dismissCount + 1 })
        );
      }
    } catch {
      // Silently fail
    }
  };

  return (
    <Modal visible={visible} onClose={handleDismiss} title="Enjoying DocuIntelli?">
      <View style={styles.content}>
        <View style={styles.stars}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Star
              key={i}
              size={28}
              color={colors.warning[500]}
              fill={colors.warning[500]}
              strokeWidth={1.5}
            />
          ))}
        </View>
        <Text style={styles.message}>
          We'd love to hear from you! Your feedback helps us improve.
        </Text>
        <View style={styles.buttons}>
          <Button title="Rate the App" onPress={handleRate} fullWidth size="lg" />
          <Button title="Send Feedback" onPress={handleFeedback} variant="outline" fullWidth />
          <Button title="Maybe Later" onPress={handleDismiss} variant="ghost" fullWidth />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { alignItems: 'center', gap: spacing.lg },
  stars: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm },
  message: {
    fontSize: typography.fontSize.base,
    color: colors.slate[600],
    textAlign: 'center',
    lineHeight: 22,
  },
  buttons: { width: '100%', gap: spacing.sm },
});
