import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StatusBar,
  Animated,
  Easing,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { goBack } from '../../../src/utils/navigation';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ArrowLeft,
  Send,
  FileText,
  Lightbulb,
  Sparkles,
} from 'lucide-react-native';
import { chatWithDocument, loadChatHistory } from '../../../src/lib/api';
import { supabase } from '../../../src/lib/supabase';
import { useSubscription } from '../../../src/hooks/useSubscription';
import GradientIcon from '../../../src/components/ui/GradientIcon';
import LoadingSpinner from '../../../src/components/ui/LoadingSpinner';
import { colors } from '../../../src/theme/colors';
import { typography } from '../../../src/theme/typography';
import { spacing, borderRadius } from '../../../src/theme/spacing';

interface ChatMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

const SUGGESTED_QUESTIONS = [
  'What are the key terms?',
  'When does this expire?',
  'Summarize this document',
];

/* ---- Animated Dots Component ---- */
function StreamingDots() {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createAnimation = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 400,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 400,
            easing: Easing.ease,
            useNativeDriver: true,
          }),
        ])
      );

    const a1 = createAnimation(dot1, 0);
    const a2 = createAnimation(dot2, 150);
    const a3 = createAnimation(dot3, 300);

    a1.start();
    a2.start();
    a3.start();

    return () => {
      a1.stop();
      a2.stop();
      a3.stop();
    };
  }, [dot1, dot2, dot3]);

  const dots = [dot1, dot2, dot3];

  return (
    <View style={styles.dotsContainer}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              opacity: dot.interpolate({
                inputRange: [0, 1],
                outputRange: [0.3, 1],
              }),
              transform: [
                {
                  translateY: dot.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -4],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function DocumentChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { canAskQuestion, incrementAIQuestions, subscription, loading: subLoading } = useSubscription();
  const [docName, setDocName] = useState('Document Chat');
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const flatListRef = useRef<FlatList>(null);

  // Load document name
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('documents')
          .select('name')
          .eq('id', id)
          .single();
        if (data?.name) setDocName(data.name);
      } catch {
        // fallback to default
      }
    })();
  }, [id]);

  // Load chat history
  useEffect(() => {
    (async () => {
      try {
        const history = await loadChatHistory(id!);
        setMessages(
          history.map((m) => ({
            ...m,
            role: m.role as 'user' | 'assistant',
          }))
        );
      } catch {
        // no history
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [id]);

  const handleSend = useCallback(
    async (questionText?: string) => {
      const question = (questionText || input).trim();
      if (!question || streaming) return;

      if (!canAskQuestion) {
        setMessages((prev) => [
          ...prev,
          {
            id: Date.now().toString(),
            role: 'assistant',
            content:
              'You have reached your daily AI question limit. Please upgrade your plan for unlimited questions.',
            created_at: new Date().toISOString(),
          },
        ]);
        return;
      }

      const userMsg: ChatMsg = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: question,
        created_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput('');
      setStreaming(true);

      let streamedContent = '';
      const assistantId = `a-${Date.now()}`;

      // Add streaming placeholder
      setMessages((prev) => [
        ...prev,
        {
          id: assistantId,
          role: 'assistant',
          content: '',
          created_at: new Date().toISOString(),
        },
      ]);

      try {
        await chatWithDocument(id!, question, (chunk) => {
          streamedContent += chunk;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId ? { ...m, content: streamedContent } : m
            )
          );
        });
        await incrementAIQuestions();
      } catch (err) {
        const errorMsg =
          err instanceof Error ? err.message : 'Chat failed';
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: `Error: ${errorMsg}` }
              : m
          )
        );
      } finally {
        setStreaming(false);
      }
    },
    [id, input, streaming, canAskQuestion, incrementAIQuestions]
  );

  const renderMessage = useCallback(
    ({ item }: { item: ChatMsg }) => {
      const isUser = item.role === 'user';
      const isStreamingPlaceholder =
        !isUser && streaming && item.content === '';

      if (isUser) {
        return (
          <View style={styles.userBubbleWrap}>
            <LinearGradient
              colors={[...colors.gradient.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.userBubble}
            >
              <Text style={styles.userBubbleText}>{item.content}</Text>
            </LinearGradient>
          </View>
        );
      }

      return (
        <View style={styles.assistantBubbleWrap}>
          <View style={styles.assistantAvatarWrap}>
            <GradientIcon size={28}>
              <Sparkles size={14} color={colors.white} />
            </GradientIcon>
          </View>
          <View style={styles.assistantBubble}>
            {isStreamingPlaceholder ? (
              <StreamingDots />
            ) : (
              <Text style={styles.assistantBubbleText}>
                {item.content}
              </Text>
            )}
          </View>
        </View>
      );
    },
    [streaming]
  );

  if (subLoading || loadingHistory) return <LoadingSpinner fullScreen />;

  const isFree = subscription?.plan === 'free';
  const questionsUsed = subscription?.ai_questions_used ?? 0;
  const questionsLimit = subscription?.ai_questions_limit ?? 5;
  const showSuggestions = messages.length === 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.white} />
      <Stack.Screen options={{ headerShown: false }} />

      {/* Custom Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => goBack('/(tabs)/vault')}
          style={styles.backButton}
          activeOpacity={0.7}
        >
          <ArrowLeft size={22} color={colors.slate[700]} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.headerDocIcon}>
            <FileText size={16} color={colors.primary[600]} />
          </View>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {docName}
            </Text>
            <Text style={styles.headerSubtitle}>AI Chat</Text>
          </View>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {/* Gradient accent stripe */}
      <LinearGradient
        colors={[...colors.gradient.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.accentStripe}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.chatContainer}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[
            styles.chatList,
            showSuggestions && styles.chatListEmpty,
          ]}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <GradientIcon size={64}>
                <Sparkles size={30} color={colors.white} />
              </GradientIcon>
              <Text style={styles.emptyTitle}>Ask anything about this document</Text>
              <Text style={styles.emptySub}>
                The AI will analyze your document and provide accurate answers based
                on its content.
              </Text>

              {/* Suggested Questions */}
              <View style={styles.suggestionsSection}>
                <View style={styles.suggestionsHeader}>
                  <Lightbulb size={16} color={colors.primary[600]} />
                  <Text style={styles.suggestionsLabel}>Try asking</Text>
                </View>
                <View style={styles.suggestionsWrap}>
                  {SUGGESTED_QUESTIONS.map((q) => (
                    <TouchableOpacity
                      key={q}
                      style={styles.suggestionPill}
                      activeOpacity={0.7}
                      onPress={() => handleSend(q)}
                    >
                      <LinearGradient
                        colors={[...colors.gradient.primaryLight]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.suggestionPillInner}
                      >
                        <Text style={styles.suggestionPillText}>{q}</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          }
          renderItem={renderMessage}
        />

        {/* Input Bar */}
        <View style={styles.inputBarContainer}>
          {/* AI question limit indicator for free tier */}
          {isFree && (
            <View style={styles.limitBar}>
              <View style={styles.limitRow}>
                <Sparkles size={12} color={colors.primary[600]} />
                <Text style={styles.limitText}>
                  {questionsUsed} / {questionsLimit} questions used today
                </Text>
              </View>
              <View style={styles.limitTrack}>
                <LinearGradient
                  colors={[...colors.gradient.primary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[
                    styles.limitFill,
                    {
                      width: `${Math.min(
                        (questionsUsed / questionsLimit) * 100,
                        100
                      )}%`,
                    },
                  ]}
                />
              </View>
            </View>
          )}

          <View style={styles.inputRow}>
            <View style={styles.inputFieldWrap}>
              <TextInput
                style={styles.textInput}
                value={input}
                onChangeText={setInput}
                placeholder="Ask about this document..."
                placeholderTextColor={colors.slate[400]}
                multiline
                maxLength={500}
                editable={!streaming}
              />
            </View>

            <TouchableOpacity
              onPress={() => handleSend()}
              disabled={!input.trim() || streaming}
              activeOpacity={0.7}
            >
              <LinearGradient
                colors={
                  !input.trim() || streaming
                    ? [colors.slate[200], colors.slate[200]]
                    : [...colors.gradient.primary]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.sendButton}
              >
                <Send
                  size={18}
                  color={
                    !input.trim() || streaming
                      ? colors.slate[400]
                      : colors.white
                  }
                />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.white,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.white,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    backgroundColor: colors.slate[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.md,
    gap: spacing.sm,
  },
  headerDocIcon: {
    width: 32,
    height: 32,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  headerSubtitle: {
    fontSize: typography.fontSize.xs,
    color: colors.primary[600],
    fontWeight: typography.fontWeight.medium,
  },
  headerSpacer: {
    width: 40,
  },

  /* Accent */
  accentStripe: {
    height: 3,
  },

  /* Chat Area */
  chatContainer: {
    flex: 1,
    backgroundColor: colors.slate[50],
  },
  chatList: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  chatListEmpty: {
    flexGrow: 1,
  },

  /* Empty State */
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: spacing['5xl'],
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
    marginTop: spacing.xl,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
  },

  /* Suggestions */
  suggestionsSection: {
    marginTop: spacing['3xl'],
    width: '100%',
  },
  suggestionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.md,
    justifyContent: 'center',
  },
  suggestionsLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.primary[700],
  },
  suggestionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'center',
  },
  suggestionPill: {
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  suggestionPillInner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primary[200],
  },
  suggestionPillText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[700],
  },

  /* User Bubble */
  userBubbleWrap: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
  },
  userBubble: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    borderBottomRightRadius: 4,
  },
  userBubbleText: {
    fontSize: typography.fontSize.base,
    color: colors.white,
    lineHeight: 22,
  },

  /* Assistant Bubble */
  assistantBubbleWrap: {
    alignSelf: 'flex-start',
    maxWidth: '88%',
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  assistantAvatarWrap: {
    marginTop: 2,
  },
  assistantBubble: {
    flex: 1,
    backgroundColor: colors.white,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.xl,
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: colors.slate[200],
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  assistantBubbleText: {
    fontSize: typography.fontSize.base,
    color: colors.slate[800],
    lineHeight: 22,
  },

  /* Streaming Dots */
  dotsContainer: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary[500],
  },

  /* Input Bar */
  inputBarContainer: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
  },

  /* Limit Bar */
  limitBar: {
    marginBottom: spacing.sm,
  },
  limitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 4,
  },
  limitText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    fontWeight: typography.fontWeight.medium,
  },
  limitTrack: {
    height: 3,
    backgroundColor: colors.slate[100],
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  limitFill: {
    height: 3,
    borderRadius: borderRadius.full,
  },

  /* Input Row */
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  inputFieldWrap: {
    flex: 1,
    backgroundColor: colors.slate[50],
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.slate[200],
  },
  textInput: {
    paddingHorizontal: spacing.lg,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    fontSize: typography.fontSize.base,
    color: colors.slate[900],
    maxHeight: 100,
    minHeight: 42,
  },

  /* Send Button */
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary[600],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
});
