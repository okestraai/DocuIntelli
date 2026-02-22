import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Platform, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, router } from 'expo-router';
import { goBack } from '../src/utils/navigation';
import {
  Search, X, FileText, Filter, ArrowRight, Sparkles, ArrowLeft,
} from 'lucide-react-native';
import { globalSearch, GlobalSearchResultGroup } from '../src/lib/api';
import { useSubscription } from '../src/hooks/useSubscription';
import ProFeatureGate from '../src/components/ProFeatureGate';
import GradientIcon from '../src/components/ui/GradientIcon';
import Badge from '../src/components/ui/Badge';
import Card from '../src/components/ui/Card';
import LoadingSpinner from '../src/components/ui/LoadingSpinner';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { spacing, borderRadius } from '../src/theme/spacing';
import { DOCUMENT_CATEGORIES } from '../src/types/document';

const CATEGORIES = [
  { value: '', label: 'All' },
  ...DOCUMENT_CATEGORIES,
];

const CATEGORY_BADGE_VARIANT: Record<string, 'primary' | 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  insurance: 'info',
  warranty: 'success',
  lease: 'primary',
  employment: 'warning',
  contract: 'info',
  other: 'default',
};

// ---- Memoised result row (avoids re-rendering all rows on every keystroke) ----

function getCategoryColor(cat: string) {
  return colors.category[cat as keyof typeof colors.category] || colors.category.other;
}

function SnippetText({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight || !text) {
    return <Text style={styles.snippetText} numberOfLines={2}>{text.substring(0, 150)}...</Text>;
  }

  const lowerText = text.toLowerCase();
  const lowerHighlight = highlight.toLowerCase();
  const idx = lowerText.indexOf(lowerHighlight);

  if (idx === -1) {
    return <Text style={styles.snippetText} numberOfLines={2}>{text.substring(0, 150)}...</Text>;
  }

  const before = text.substring(Math.max(0, idx - 40), idx);
  const match = text.substring(idx, idx + highlight.length);
  const after = text.substring(idx + highlight.length, idx + highlight.length + 80);

  return (
    <Text style={styles.snippetText} numberOfLines={2}>
      {before.length > 0 && idx > 40 ? '...' : ''}{before}
      <Text style={styles.snippetHighlight}>{match}</Text>
      {after}...
    </Text>
  );
}

const ResultRow = React.memo(function ResultRow({
  item,
  searchQuery,
}: {
  item: GlobalSearchResultGroup;
  searchQuery: string;
}) {
  const catColor = getCategoryColor(item.document_category);
  return (
    <TouchableOpacity
      style={styles.resultCard}
      onPress={() => router.push({ pathname: '/document/[id]', params: { id: item.document_id } })}
      activeOpacity={0.7}
    >
      <View style={[styles.resultAccent, { backgroundColor: catColor.border }]} />
      <View style={styles.resultContent}>
        <View style={styles.resultHeader}>
          <View style={[styles.resultIconBox, { backgroundColor: catColor.bg }]}>
            <FileText size={16} color={catColor.text} strokeWidth={2} />
          </View>
          <View style={styles.resultTitleCol}>
            <Text style={styles.resultName} numberOfLines={1}>{item.document_name}</Text>
            <View style={styles.resultMeta}>
              <Badge
                label={item.document_category}
                variant={CATEGORY_BADGE_VARIANT[item.document_category] || 'default'}
              />
              <Text style={styles.matchCount}>
                {item.total_matches ?? item.matches.length} match{(item.total_matches ?? item.matches.length) !== 1 ? 'es' : ''}
              </Text>
            </View>
          </View>
          <ArrowRight size={16} color={colors.slate[300]} strokeWidth={2} />
        </View>

        <View style={styles.snippetsContainer}>
          {item.matches.slice(0, 2).map((match) => (
            <View key={match.chunk_id} style={styles.snippetRow}>
              <View style={styles.snippetBullet} />
              <SnippetText text={match.chunk_text} highlight={match.highlight || searchQuery} />
            </View>
          ))}
        </View>

        {(item.total_matches ?? item.matches.length) > 2 && (
          <Text style={styles.moreMatches}>
            +{(item.total_matches ?? item.matches.length) - 2} more match{(item.total_matches ?? item.matches.length) - 2 !== 1 ? 'es' : ''} in this document
          </Text>
        )}

        {item.document_tags && item.document_tags.length > 0 && (
          <View style={styles.tagsRow}>
            {item.document_tags.slice(0, 3).map((tag) => (
              <View key={tag} style={styles.tagChip}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
            {item.document_tags.length > 3 && (
              <Text style={styles.moreTagsText}>+{item.document_tags.length - 3}</Text>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

// ---- Main screen ----

export default function SearchScreen() {
  const { subscription, loading: subLoading } = useSubscription();
  const isPro = subscription?.plan === 'pro';

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [results, setResults] = useState<GlobalSearchResultGroup[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [queryTimeMs, setQueryTimeMs] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  // Track the query that produced the current results (for highlight accuracy)
  const [resultQuery, setResultQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<TextInput>(null);

  const doSearch = useCallback(async (q: string, cat: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      setTotalChunks(0);
      return;
    }

    // Abort any in-flight request
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setIsSearching(true);
    setSearchError(null);

    try {
      const response = await globalSearch(q, {
        category: cat || undefined,
        limit: 20,
      });
      // Ignore results if this request was aborted (superseded)
      if (controller.signal.aborted) return;
      setResults(response.results);
      setTotalChunks(response.total_chunks);
      setQueryTimeMs(response.query_time_ms);
      setResultQuery(q);
      setHasSearched(true);
    } catch (err: any) {
      if (controller.signal.aborted) return;
      if (err.code === 'FEATURE_NOT_AVAILABLE') {
        setSearchError('pro_required');
      } else {
        setSearchError(err.message || 'Search failed');
      }
      setResults([]);
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false);
      }
    }
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value, category), 500);
  }, [category, doSearch]);

  const handleClearQuery = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setTotalChunks(0);
    setSearchError(null);
    setIsSearching(false);
    inputRef.current?.focus();
  }, []);

  const handleCategoryChange = useCallback((value: string) => {
    setCategory(value);
    if (query.trim().length >= 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(query, value), 300);
    }
  }, [query, doSearch]);

  const onRefresh = useCallback(async () => {
    if (query.trim().length < 2) return;
    setRefreshing(true);
    await doSearch(query, category);
    setRefreshing(false);
  }, [query, category, doSearch]);

  // Stable renderItem using memoised ResultRow — uses resultQuery for highlights
  const renderItem = useCallback(({ item }: { item: GlobalSearchResultGroup }) => (
    <ResultRow item={item} searchQuery={resultQuery} />
  ), [resultQuery]);

  const keyExtractor = useCallback((item: GlobalSearchResultGroup) => item.document_id, []);

  const listFooter = useMemo(() => (
    <View style={styles.footer}>
      <View style={styles.footerInner}>
        <View style={styles.footerStat}>
          <Sparkles size={12} color={colors.primary[500]} strokeWidth={2} />
          <Text style={styles.footerText}>
            {totalChunks} match{totalChunks !== 1 ? 'es' : ''} across {results.length} document{results.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <Text style={styles.footerTime}>{queryTimeMs}ms</Text>
      </View>
    </View>
  ), [totalChunks, results.length, queryTimeMs]);

  if (subLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <LoadingSpinner fullScreen />
      </>
    );
  }

  if (!isPro) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <TouchableOpacity
            onPress={() => goBack()}
            style={styles.backButtonFloat}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={colors.slate[700]} strokeWidth={2} />
          </TouchableOpacity>
          <ProFeatureGate
            featureName="Global Search"
            featureDescription="Search across all your documents with AI-powered semantic search. Find any clause, term, or detail in seconds."
            onUpgrade={() => router.push('/billing')}
          />
        </SafeAreaView>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        {/* Gradient header */}
        <LinearGradient
          colors={[...colors.gradient.primary]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}
        >
          <TouchableOpacity
            onPress={() => goBack()}
            style={styles.backButton}
            activeOpacity={0.7}
          >
            <ArrowLeft size={20} color={colors.white} strokeWidth={2} />
          </TouchableOpacity>
          <View style={styles.headerTextBlock}>
            <Text style={styles.headerTitle}>Global Search</Text>
            <Text style={styles.headerSubtitle}>AI-powered semantic search</Text>
          </View>
          <View style={styles.headerIcon}>
            <Search size={22} color="rgba(255,255,255,0.7)" strokeWidth={2} />
          </View>
        </LinearGradient>

        {/* Search bar */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Search size={18} color={colors.slate[400]} strokeWidth={2} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              value={query}
              onChangeText={handleQueryChange}
              placeholder="Search all documents..."
              placeholderTextColor={colors.slate[400]}
              autoFocus
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {isSearching && (
              <ActivityIndicator size="small" color={colors.primary[600]} />
            )}
            {query.length > 0 && !isSearching && (
              <TouchableOpacity onPress={handleClearQuery} hitSlop={8}>
                <View style={styles.clearButton}>
                  <X size={14} color={colors.slate[500]} strokeWidth={2.5} />
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Category filter chips */}
        <View style={styles.filterWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {CATEGORIES.map((item) => {
            const isActive = category === item.value;
            const catColor = item.value ? getCategoryColor(item.value) : null;
            return (
              <TouchableOpacity
                key={item.value || '_all'}
                style={[
                  styles.filterChip,
                  isActive && (catColor
                    ? { backgroundColor: catColor.bg, borderColor: catColor.border }
                    : styles.filterChipActiveAll),
                ]}
                onPress={() => handleCategoryChange(item.value)}
                activeOpacity={0.7}
              >
                {item.value === '' && (
                  <Filter size={12} color={isActive ? colors.white : colors.slate[400]} strokeWidth={2.5} />
                )}
                {item.value !== '' && (
                  <View style={[styles.filterDot, { backgroundColor: catColor?.text || colors.slate[400] }]} />
                )}
                <Text style={[
                  styles.filterText,
                  isActive && (catColor
                    ? { color: catColor.text, fontWeight: typography.fontWeight.semibold }
                    : styles.filterTextActiveAll),
                ]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        </View>

        {/* Error */}
        {searchError && searchError !== 'pro_required' && (
          <View style={styles.stateContainer}>
            <Card style={styles.errorCard}>
              <Text style={styles.errorText}>{searchError}</Text>
            </Card>
          </View>
        )}

        {/* Initial / empty state */}
        {!searchError && !isSearching && !hasSearched && query.length < 2 && (
          <View style={styles.stateContainer}>
            <GradientIcon size={64} light>
              <Search size={28} color={colors.primary[600]} strokeWidth={2} />
            </GradientIcon>
            <Text style={styles.stateTitle}>Search your vault</Text>
            <Text style={styles.stateSubtext}>
              Type at least 2 characters to search across{'\n'}all your documents with AI-powered search
            </Text>
            <View style={styles.stateHint}>
              <Sparkles size={14} color={colors.primary[500]} strokeWidth={2} />
              <Text style={styles.stateHintText}>Semantic search finds meaning, not just keywords</Text>
            </View>
          </View>
        )}

        {/* No results */}
        {!searchError && !isSearching && hasSearched && results.length === 0 && (
          <View style={styles.stateContainer}>
            <GradientIcon size={56} light>
              <FileText size={24} color={colors.primary[600]} strokeWidth={2} />
            </GradientIcon>
            <Text style={styles.stateTitle}>No results found</Text>
            <Text style={styles.stateSubtext}>
              Try broader search terms or remove category filters
            </Text>
          </View>
        )}

        {/* Results */}
        {results.length > 0 && (
          <FlatList
            data={results}
            keyExtractor={keyExtractor}
            renderItem={renderItem}
            contentContainerStyle={styles.resultsList}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={[colors.primary[500]]}
                tintColor={colors.primary[500]}
              />
            }
            removeClippedSubviews={Platform.OS !== 'web'}
            maxToRenderPerBatch={10}
            windowSize={5}
            initialNumToRender={8}
            ListFooterComponent={listFooter}
          />
        )}
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.slate[50],
  },

  /* ---- Header ---- */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonFloat: {
    position: 'absolute',
    top: spacing.lg,
    left: spacing.lg,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  headerTextBlock: {
    flex: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.white,
  },
  headerSubtitle: {
    fontSize: typography.fontSize.xs,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ---- Search bar ---- */
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.slate[200],
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.fontSize.base,
    color: colors.slate[900],
    padding: 0,
  },
  clearButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.slate[100],
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ---- Category filter chips ---- */
  filterWrapper: {
    flexShrink: 0,
  },
  filterRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.slate[200],
  },
  filterChipActiveAll: {
    backgroundColor: colors.primary[600],
    borderColor: colors.primary[600],
  },
  filterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  filterText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[600],
    fontWeight: typography.fontWeight.medium,
  },
  filterTextActiveAll: {
    color: colors.white,
    fontWeight: typography.fontWeight.semibold,
  },

  /* ---- State containers (empty, no results) ---- */
  stateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  stateTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[800],
    marginTop: spacing.sm,
  },
  stateSubtext: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    textAlign: 'center',
    lineHeight: 22,
  },
  stateHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    backgroundColor: colors.primary[50],
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
  },
  stateHintText: {
    fontSize: typography.fontSize.xs,
    color: colors.primary[700],
    fontWeight: typography.fontWeight.medium,
  },
  errorCard: {
    backgroundColor: colors.error[50],
    borderColor: colors.error[200],
  },
  errorText: {
    fontSize: typography.fontSize.sm,
    color: colors.error[700],
    textAlign: 'center',
  },

  /* ---- Results list ---- */
  resultsList: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  resultCard: {
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.slate[200],
    overflow: 'hidden',
    flexDirection: 'row',
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
    marginBottom: spacing.xs,
  },
  resultAccent: {
    width: 4,
  },
  resultContent: {
    flex: 1,
    padding: spacing.md,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  resultIconBox: {
    width: 36,
    height: 36,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTitleCol: {
    flex: 1,
    gap: spacing.xs,
  },
  resultName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
  },
  resultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  matchCount: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
  },

  /* ---- Snippets ---- */
  snippetsContainer: {
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  snippetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  snippetBullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.slate[300],
    marginTop: 7,
  },
  snippetText: {
    flex: 1,
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    lineHeight: 18,
  },
  snippetHighlight: {
    backgroundColor: colors.warning[100],
    color: colors.slate[800],
    fontWeight: typography.fontWeight.semibold,
  },
  moreMatches: {
    fontSize: typography.fontSize.xs,
    color: colors.primary[600],
    fontWeight: typography.fontWeight.medium,
    marginTop: spacing.xs,
  },

  /* ---- Tags ---- */
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.slate[100],
  },
  tagChip: {
    backgroundColor: colors.slate[100],
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  tagText: {
    fontSize: 10,
    color: colors.slate[600],
    fontWeight: typography.fontWeight.medium,
  },
  moreTagsText: {
    fontSize: 10,
    color: colors.slate[400],
  },

  /* ---- Footer ---- */
  footer: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.slate[200],
  },
  footerInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  footerText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[500],
    fontWeight: typography.fontWeight.medium,
  },
  footerTime: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
    fontWeight: typography.fontWeight.medium,
  },
});
