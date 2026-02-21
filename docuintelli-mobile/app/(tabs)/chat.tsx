import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { MessageSquare, Send, Sparkles, FileText } from 'lucide-react-native';
import { globalChatStream, loadGlobalChatHistory, GlobalChatSource } from '../../src/lib/api';
import { useSubscription } from '../../src/hooks/useSubscription';
import ProFeatureGate from '../../src/components/ProFeatureGate';
import GradientIcon from '../../src/components/ui/GradientIcon';
import LoadingSpinner from '../../src/components/ui/LoadingSpinner';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { spacing, borderRadius } from '../../src/theme/spacing';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: GlobalChatSource[];
  isStreaming?: boolean;
}

export default function GlobalChatScreen() {
  const { subscription, loading: subLoading } = useSubscription();
  const isPro = subscription?.plan === 'pro';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  // Load chat history
  useEffect(() => {
    if (!isPro) {
      setHistoryLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const history = await loadGlobalChatHistory();
        if (cancelled) return;
        if (history.length > 0) {
          setMessages(
            history.map((msg) => ({
              id: msg.id,
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
              sources: msg.sources,
            }))
          );
        }
      } catch {
        // no history
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPro]);

  const handleSend = async () => {
    const question = input.trim();
    if (!question || loading) return;

    setError(null);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    };

    const assistantId = `assistant-${Date.now()}`;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setLoading(true);

    try {
      const result = await globalChatStream(question, (chunk) => {
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.isStreaming) {
            updated[updated.length - 1] = { ...last, content: last.content + chunk };
          }
          return updated;
        });
      });

      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last && last.isStreaming) {
          updated[updated.length - 1] = {
            ...last,
            content: result.answer || last.content,
            sources: result.sources,
            isStreaming: false,
          };
        }
        return updated;
      });
    } catch (err: any) {
      setMessages((prev) => {
        const updated = [...prev];
        if (updated[updated.length - 1]?.isStreaming) {
          updated.pop();
        }
        return updated;
      });
      setError(err.message || 'Chat failed');
    } finally {
      setLoading(false);
    }
  };

  // Wait for subscription data before checking plan
  if (subLoading) return <LoadingSpinner fullScreen />;

  // Non-pro gate
  if (!isPro) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ProFeatureGate
          featureName="Global Chat"
          featureDescription="Chat across all your documents with AI. Ask questions that span multiple documents and get instant answers."
          onUpgrade={() => router.push('/billing')}
        />
      </SafeAreaView>
    );
  }

  if (historyLoading) return <LoadingSpinner fullScreen />;

  const canSend = input.trim().length > 0 && !loading;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={[
            styles.chatList,
            messages.length === 0 && styles.chatListEmpty,
          ]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <GradientIcon size={72}>
                <MessageSquare size={36} color={colors.white} />
              </GradientIcon>
              <Text style={styles.emptyTitle}>Ask me anything</Text>
              <Text style={styles.emptySub}>
                Chat across all your documents.{'\n'}AI will find answers from your entire vault.
              </Text>

              {/* Suggestion chips */}
              <View style={styles.suggestionsWrap}>
                {[
                  'What warranties expire soon?',
                  'Summarize my lease terms',
                  'Find my insurance coverage details',
                ].map((suggestion, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.suggestionChip}
                    activeOpacity={0.7}
                    onPress={() => setInput(suggestion)}
                  >
                    <Sparkles size={12} color={colors.primary[500]} />
                    <Text style={styles.suggestionText}>{suggestion}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.messageWrap}>
              {/* Message bubble */}
              {item.role === 'user' ? (
                <View style={styles.userRow}>
                  <LinearGradient
                    colors={[...colors.gradient.primary]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.userBubble}
                  >
                    <Text style={styles.userText}>
                      {item.content}
                    </Text>
                  </LinearGradient>
                </View>
              ) : (
                <View style={styles.assistantRow}>
                  {/* Avatar */}
                  <View style={styles.assistantAvatar}>
                    <Sparkles size={14} color={colors.primary[600]} />
                  </View>
                  <View style={styles.assistantBubble}>
                    <Text style={styles.assistantText}>
                      {item.content || (item.isStreaming ? '...' : '')}
                    </Text>
                    {item.isStreaming && (
                      <View style={styles.streamingDots}>
                        <ActivityIndicator size="small" color={colors.primary[400]} />
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Source tags */}
              {item.role === 'assistant' &&
                item.sources &&
                item.sources.length > 0 &&
                !item.isStreaming && (
                  <View style={styles.sourceRow}>
                    <FileText size={12} color={colors.slate[400]} />
                    {Array.from(
                      new Map<string, GlobalChatSource>(
                        item.sources.map((s: GlobalChatSource) => [s.document_id, s])
                      ).values()
                    )
                      .slice(0, 3)
                      .map((source) => (
                        <TouchableOpacity
                          key={source.document_id}
                          style={styles.sourceTag}
                          activeOpacity={0.7}
                          onPress={() =>
                            router.push({
                              pathname: '/document/[id]/chat',
                              params: { id: source.document_id },
                            })
                          }
                        >
                          <Text style={styles.sourceTagText} numberOfLines={1}>
                            {source.document_name}
                          </Text>
                        </TouchableOpacity>
                      ))}
                  </View>
                )}
            </View>
          )}
        />

        {/* Error */}
        {error && (
          <View style={styles.errorBar}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={() => setError(null)}>
              <Text style={styles.errorDismiss}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <View style={styles.inputRow}>
            <View style={styles.textInputWrap}>
              <TextInput
                style={styles.textInput}
                value={input}
                onChangeText={setInput}
                placeholder="Ask about your documents..."
                placeholderTextColor={colors.slate[400]}
                multiline
                maxLength={500}
                editable={!loading}
              />
            </View>

            {/* Send button */}
            <TouchableOpacity
              onPress={handleSend}
              disabled={!canSend}
              activeOpacity={0.7}
              style={styles.sendBtnOuter}
            >
              {canSend ? (
                <LinearGradient
                  colors={[...colors.gradient.primary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.sendBtnGradient}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Send size={18} color={colors.white} />
                  )}
                </LinearGradient>
              ) : (
                <View style={styles.sendBtnDisabled}>
                  <Send size={18} color={colors.slate[400]} />
                </View>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.poweredBy}>Powered by Okestra AI Labs</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.slate[50],
  },
  container: {
    flex: 1,
  },

  // Chat list
  chatList: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  chatListEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[800],
    marginTop: spacing.lg,
  },
  emptySub: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center',
    lineHeight: 20,
  },
  suggestionsWrap: {
    marginTop: spacing.xl,
    gap: spacing.sm,
    width: '100%',
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.primary[200],
    borderRadius: borderRadius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  suggestionText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[600],
    flex: 1,
  },

  // Message wrappers
  messageWrap: {
    marginBottom: spacing.xs,
  },
  userRow: {
    alignItems: 'flex-end',
  },
  assistantRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },

  // User bubble
  userBubble: {
    maxWidth: '82%',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 20,
    borderBottomRightRadius: 6,
  },
  userText: {
    fontSize: typography.fontSize.base,
    color: colors.white,
    lineHeight: 22,
  },

  // Assistant
  assistantAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  assistantBubble: {
    maxWidth: '78%',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate[200],
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  assistantText: {
    fontSize: typography.fontSize.base,
    color: colors.slate[800],
    lineHeight: 22,
  },
  streamingDots: {
    marginTop: spacing.xs,
  },

  // Source tags
  sourceRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
    flexWrap: 'wrap',
    marginLeft: 36, // avatar width + gap
    alignItems: 'center',
  },
  sourceTag: {
    backgroundColor: colors.primary[50],
    borderWidth: 1,
    borderColor: colors.primary[200],
    borderRadius: borderRadius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  sourceTagText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[700],
    maxWidth: 120,
  },

  // Error bar
  errorBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.error[50],
    borderTopWidth: 1,
    borderTopColor: colors.error[200],
  },
  errorText: {
    fontSize: typography.fontSize.xs,
    color: colors.error[600],
    flex: 1,
  },
  errorDismiss: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semibold,
    color: colors.error[700],
    marginLeft: spacing.md,
  },

  // Input bar
  inputBar: {
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.slate[200],
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
  },
  textInputWrap: {
    flex: 1,
    backgroundColor: colors.slate[50],
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.slate[200],
    paddingHorizontal: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  textInput: {
    fontSize: typography.fontSize.base,
    color: colors.slate[900],
    maxHeight: 100,
    paddingVertical: spacing.sm,
  },

  // Send button
  sendBtnOuter: {
    marginBottom: 2,
  },
  sendBtnGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary[600],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  sendBtnDisabled: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Footer
  poweredBy: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
