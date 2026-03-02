import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Linking,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import {
  HelpCircle,
  ChevronDown,
  Mail,
} from 'lucide-react-native';
import Card from '../src/components/ui/Card';
import Button from '../src/components/ui/Button';
import GradientIcon from '../src/components/ui/GradientIcon';
import { HELP_TOPICS, type HelpTopic, type HelpQuestion } from '../src/content/helpTopics';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { spacing, borderRadius } from '../src/theme/spacing';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function HelpScreen() {
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());

  const toggleTopic = (topicId: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedTopics(prev => {
      const next = new Set(prev);
      if (next.has(topicId)) {
        next.delete(topicId);
      } else {
        next.add(topicId);
      }
      return next;
    });
  };

  const toggleQuestion = (questionKey: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(questionKey)) {
        next.delete(questionKey);
      } else {
        next.add(questionKey);
      }
      return next;
    });
  };

  const handleEmailSupport = () => {
    Linking.openURL('mailto:support@docuintelli.com');
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Help Center', headerShown: true }} />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerRow}>
              <GradientIcon size={44}>
                <HelpCircle size={22} color={colors.white} strokeWidth={2} />
              </GradientIcon>
              <View style={styles.headerTextCol}>
                <Text style={styles.pageTitle}>Help Center</Text>
                <Text style={styles.pageSubtitle}>
                  Find answers to common questions
                </Text>
              </View>
            </View>
          </View>

          {/* Topic Sections */}
          {HELP_TOPICS.map((topic: HelpTopic) => {
            const isTopicExpanded = expandedTopics.has(topic.id);
            const TopicIcon = topic.icon;

            return (
              <Card key={topic.id} style={styles.topicCard}>
                {/* Topic Header */}
                <TouchableOpacity
                  onPress={() => toggleTopic(topic.id)}
                  style={styles.topicHeader}
                  activeOpacity={0.7}
                >
                  <View style={styles.topicHeaderLeft}>
                    <View
                      style={[
                        styles.topicIconCircle,
                        { backgroundColor: topic.iconBg },
                      ]}
                    >
                      <TopicIcon
                        size={18}
                        color={topic.iconColor}
                        strokeWidth={2}
                      />
                    </View>
                    <Text style={styles.topicTitle}>{topic.title}</Text>
                  </View>
                  <View
                    style={[
                      styles.chevronContainer,
                      isTopicExpanded && styles.chevronRotated,
                    ]}
                  >
                    <ChevronDown
                      size={18}
                      color={colors.slate[400]}
                      strokeWidth={2}
                    />
                  </View>
                </TouchableOpacity>

                {/* Expandable Questions */}
                {isTopicExpanded && (
                  <View style={styles.questionsContainer}>
                    {topic.questions.map(
                      (q: HelpQuestion, qIndex: number) => {
                        const questionKey = `${topic.id}-${qIndex}`;
                        const isQuestionExpanded =
                          expandedQuestions.has(questionKey);

                        return (
                          <View
                            key={questionKey}
                            style={[
                              styles.questionItem,
                              qIndex < topic.questions.length - 1 &&
                                styles.questionItemBorder,
                            ]}
                          >
                            <TouchableOpacity
                              onPress={() => toggleQuestion(questionKey)}
                              style={styles.questionRow}
                              activeOpacity={0.7}
                            >
                              <Text style={styles.questionText}>
                                {q.question}
                              </Text>
                              <View
                                style={[
                                  styles.questionChevron,
                                  isQuestionExpanded &&
                                    styles.chevronRotated,
                                ]}
                              >
                                <ChevronDown
                                  size={14}
                                  color={colors.slate[400]}
                                  strokeWidth={2}
                                />
                              </View>
                            </TouchableOpacity>

                            {isQuestionExpanded && (
                              <Text style={styles.answerText}>
                                {q.answer}
                              </Text>
                            )}
                          </View>
                        );
                      }
                    )}
                  </View>
                )}
              </Card>
            );
          })}

          {/* Footer Card */}
          <Card style={styles.footerCard}>
            <Text style={styles.footerTitle}>Still have questions?</Text>
            <Text style={styles.footerSubtitle}>
              Our support team is here to help you with anything not covered
              above.
            </Text>
            <Button
              title="Email Support"
              onPress={handleEmailSupport}
              variant="outline"
              size="md"
              icon={
                <Mail
                  size={16}
                  color={colors.slate[700]}
                  strokeWidth={2}
                />
              }
            />
            <Text style={styles.footerFinePrint}>
              We typically respond within 24 hours
            </Text>
          </Card>
        </ScrollView>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.slate[50],
  },
  scroll: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },

  // Header
  header: {
    marginBottom: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerTextCol: {
    flex: 1,
  },
  pageTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  pageSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    marginTop: 2,
  },

  // Topic cards
  topicCard: {
    paddingVertical: 0,
    paddingHorizontal: 0,
    overflow: 'hidden',
  },
  topicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  topicHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  topicIconCircle: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topicTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
    flex: 1,
  },
  chevronContainer: {
    transform: [{ rotate: '0deg' }],
  },
  chevronRotated: {
    transform: [{ rotate: '180deg' }],
  },

  // Questions
  questionsContainer: {
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
  },
  questionItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  questionItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.slate[50],
  },
  questionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  questionText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.slate[800],
    flex: 1,
  },
  questionChevron: {
    transform: [{ rotate: '0deg' }],
  },
  answerText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[600],
    lineHeight: 20,
    marginTop: spacing.sm,
  },

  // Footer
  footerCard: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  footerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
  },
  footerSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  footerFinePrint: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
    marginTop: spacing.xs,
  },
});
