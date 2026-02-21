import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Dimensions,
  Platform,
} from 'react-native';
import { useToast } from '../../src/contexts/ToastContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import {
  FileText,
  Search,
  Filter,
  Calendar,
  Eye,
  Plus,
  Trash2,
  FolderOpen,
  Shield,
  Sparkles,
  CheckCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
  MessageCircle,
  Tag,
} from 'lucide-react-native';
import { useAuth } from '../../src/hooks/useAuth';
import { useDocuments } from '../../src/hooks/useDocuments';
import Badge from '../../src/components/ui/Badge';
import Card from '../../src/components/ui/Card';
import Button from '../../src/components/ui/Button';
import ConfirmModal from '../../src/components/subscription/ConfirmModal';
import GradientIcon from '../../src/components/ui/GradientIcon';
import LoadingSpinner from '../../src/components/ui/LoadingSpinner';
import { colors } from '../../src/theme/colors';
import { typography } from '../../src/theme/typography';
import { spacing, borderRadius } from '../../src/theme/spacing';
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '../../src/types/document';
import type { Document } from '../../src/types/document';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ── Category icon mapping ────────────────────────────────────────────
const CATEGORY_ICONS: Record<DocumentCategory, React.ComponentType<any>> = {
  insurance: Shield,
  warranty: CheckCircle,
  lease: FileText,
  employment: FileText,
  contract: FileText,
  other: FileText,
};

// ── Status configuration ─────────────────────────────────────────────
const STATUS_CONFIG: Record<
  string,
  { color: string; bgColor: string; label: string; icon: React.ComponentType<any> }
> = {
  active: {
    color: colors.success[600],
    bgColor: colors.success[50],
    label: 'Active',
    icon: CheckCircle,
  },
  expiring: {
    color: colors.warning[600],
    bgColor: colors.warning[50],
    label: 'Expiring',
    icon: Clock,
  },
  expired: {
    color: colors.error[600],
    bgColor: colors.error[50],
    label: 'Expired',
    icon: AlertTriangle,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────
function formatDate(dateString?: string): string {
  if (!dateString) return '';
  const d = new Date(dateString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getCategoryColor(category: DocumentCategory) {
  return colors.category[category] || colors.category.other;
}

// ── Main Screen ──────────────────────────────────────────────────────
export default function VaultScreen() {
  const { isAuthenticated } = useAuth();
  const { documents, loading, deleteDocument, refetch } = useDocuments(isAuthenticated);
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | 'all'>('all');
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    let list = documents;
    if (selectedCategory !== 'all') list = list.filter((d) => d.category === selectedCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          (d.tags && d.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }
    return list;
  }, [documents, selectedCategory, search]);

  const handleDelete = useCallback((doc: Document) => {
    setDeleteTarget(doc);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteDocument(deleteTarget.id);
      showToast('Document deleted', 'success');
      setDeleteTarget(null);
    } catch {
      showToast('Failed to delete document. Please try again.', 'error');
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, deleteDocument, showToast]);

  const handleNavigateToDocument = useCallback((id: string) => {
    router.push({ pathname: '/document/[id]', params: { id } });
  }, []);

  // ── Header Section ─────────────────────────────────────────────────
  const renderHeader = () => (
    <View style={styles.headerSection}>
      {/* Title row */}
      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          <GradientIcon size={42}>
            <FileText size={22} color={colors.white} />
          </GradientIcon>
          <View style={styles.titleTextGroup}>
            <Text style={styles.title}>Document Vault</Text>
            <Text style={styles.subtitle}>
              {documents.length} document{documents.length !== 1 ? 's' : ''} stored securely
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => router.push('/upload')}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={[...colors.gradient.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.addButtonGradient}
          >
            <Plus size={20} color={colors.white} strokeWidth={2.5} />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchIconContainer}>
          <Search size={18} color={colors.slate[400]} />
        </View>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or tag..."
          placeholderTextColor={colors.slate[400]}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <TouchableOpacity
            style={styles.searchClear}
            onPress={() => setSearch('')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.searchClearText}>Clear</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Category filter chips */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={[{ value: 'all' as const, label: 'All' }, ...DOCUMENT_CATEGORIES]}
        keyExtractor={(item) => item.value}
        contentContainerStyle={styles.filterRow}
        renderItem={({ item }) => {
          const isActive = selectedCategory === item.value;
          const catColor =
            item.value !== 'all' ? getCategoryColor(item.value as DocumentCategory) : null;

          return (
            <TouchableOpacity
              style={[
                styles.filterChip,
                isActive && styles.filterChipActive,
                !isActive && catColor && { borderColor: catColor.border },
              ]}
              onPress={() => setSelectedCategory(item.value as any)}
              activeOpacity={0.7}
            >
              {isActive ? (
                <LinearGradient
                  colors={[...colors.gradient.primary]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.filterChipGradient}
                >
                  <Text style={styles.filterTextActive}>{item.label}</Text>
                  {item.value === 'all' && (
                    <View style={styles.chipCount}>
                      <Text style={styles.chipCountText}>{documents.length}</Text>
                    </View>
                  )}
                </LinearGradient>
              ) : (
                <View style={styles.filterChipInner}>
                  <Text style={[styles.filterText, catColor && { color: catColor.text }]}>
                    {item.label}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />

      {/* Results count when filtered */}
      {(search.trim() || selectedCategory !== 'all') && (
        <View style={styles.resultsBar}>
          <Filter size={14} color={colors.slate[400]} />
          <Text style={styles.resultsText}>
            {filtered.length} result{filtered.length !== 1 ? 's' : ''}
            {selectedCategory !== 'all' ? ` in ${selectedCategory}` : ''}
            {search.trim() ? ` for "${search}"` : ''}
          </Text>
        </View>
      )}
    </View>
  );

  // ── Document Card ──────────────────────────────────────────────────
  const renderDocumentCard = ({ item }: { item: Document }) => {
    const catColor = getCategoryColor(item.category);
    const statusConf = STATUS_CONFIG[item.status] || STATUS_CONFIG.active;
    const CategoryIcon = CATEGORY_ICONS[item.category] || FileText;
    const StatusIcon = statusConf.icon;

    return (
      <View style={styles.cardTouchable}>
        <Card style={styles.docCard}>
          {/* Tappable content area — navigates to document */}
          <TouchableOpacity
            onPress={() => handleNavigateToDocument(item.id)}
            activeOpacity={0.7}
          >
            {/* Top row: icon + info + status */}
            <View style={styles.cardTopRow}>
              {/* Category icon */}
              <View style={[styles.categoryIconBox, { backgroundColor: catColor.bg }]}>
                <CategoryIcon size={18} color={catColor.text} />
              </View>

              {/* Document info */}
              <View style={styles.cardInfo}>
                <Text style={styles.docName} numberOfLines={1}>
                  {item.name}
                </Text>
                <View style={styles.metaRow}>
                  <View style={[styles.categoryBadge, { backgroundColor: catColor.bg, borderColor: catColor.border }]}>
                    <Text style={[styles.categoryBadgeText, { color: catColor.text }]}>
                      {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                    </Text>
                  </View>
                  <View style={styles.metaSeparator} />
                  <Calendar size={11} color={colors.slate[400]} />
                  <Text style={styles.metaText}>{formatDate(item.upload_date || item.created_at)}</Text>
                  {item.size && item.size !== '0 KB' && (
                    <>
                      <View style={styles.metaSeparator} />
                      <Text style={styles.metaText}>{item.size}</Text>
                    </>
                  )}
                </View>
              </View>

              {/* Status indicator */}
              <View style={[styles.statusPill, { backgroundColor: statusConf.bgColor }]}>
                <StatusIcon size={12} color={statusConf.color} />
                <Text style={[styles.statusText, { color: statusConf.color }]}>
                  {statusConf.label}
                </Text>
              </View>
            </View>

            {/* Tags row */}
            {item.tags && item.tags.length > 0 && (
              <View style={styles.tagsContainer}>
                <Tag size={11} color={colors.slate[400]} style={styles.tagIcon} />
                <View style={styles.tagRow}>
                  {item.tags.slice(0, 3).map((tag) => (
                    <View key={tag} style={styles.tagChip}>
                      <Text style={styles.tagText}>{tag}</Text>
                    </View>
                  ))}
                  {item.tags.length > 3 && (
                    <Text style={styles.moreTag}>+{item.tags.length - 3}</Text>
                  )}
                </View>
              </View>
            )}

            {/* Expiration date if applicable */}
            {item.expiration_date && (
              <View style={styles.expirationRow}>
                <Clock size={12} color={colors.slate[400]} />
                <Text style={styles.expirationText}>
                  Expires {formatDate(item.expiration_date)}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.cardDivider} />

          {/* Action buttons — outside the navigating touchable to prevent event conflicts */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleNavigateToDocument(item.id)}
              activeOpacity={0.7}
            >
              <Eye size={15} color={colors.primary[600]} />
              <Text style={styles.actionButtonText}>View</Text>
            </TouchableOpacity>

            <View style={styles.actionSeparator} />

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() =>
                router.push({ pathname: '/document/[id]', params: { id: item.id, tab: 'chat' } })
              }
              activeOpacity={0.7}
            >
              <MessageCircle size={15} color={colors.teal[600]} />
              <Text style={[styles.actionButtonText, { color: colors.teal[600] }]}>Chat</Text>
            </TouchableOpacity>

            <View style={styles.actionSeparator} />

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => handleDelete(item)}
              activeOpacity={0.7}
            >
              <Trash2 size={15} color={colors.error[500]} />
              <Text style={[styles.actionButtonText, { color: colors.error[500] }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </Card>
      </View>
    );
  };

  // ── Empty State ────────────────────────────────────────────────────
  const renderEmptyState = () => {
    const isFiltering = search.trim() || selectedCategory !== 'all';

    return (
      <View style={styles.emptyContainer}>
        {/* Large gradient circle with icon */}
        <View style={styles.emptyIconOuter}>
          <LinearGradient
            colors={[...colors.gradient.primaryLight]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.emptyIconCircle}
          >
            <LinearGradient
              colors={[...colors.gradient.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.emptyIconInner}
            >
              {isFiltering ? (
                <Search size={28} color={colors.white} />
              ) : (
                <FolderOpen size={28} color={colors.white} />
              )}
            </LinearGradient>
          </LinearGradient>
        </View>

        <Text style={styles.emptyTitle}>
          {isFiltering ? 'No matches found' : 'No documents yet'}
        </Text>
        <Text style={styles.emptySubtitle}>
          {isFiltering
            ? 'Try adjusting your search or filters to find what you need.'
            : 'Your secure document vault is ready. Upload your first document to get started.'}
        </Text>

        {!isFiltering && (
          <>
            <Button
              title="Upload Your First Document"
              onPress={() => router.push('/upload')}
              variant="primary"
              size="lg"
              icon={<Plus size={18} color={colors.white} />}
              style={styles.emptyButton}
            />

            {/* Trust badges */}
            <View style={styles.trustBadgesRow}>
              <View style={styles.trustBadge}>
                <Shield size={14} color={colors.primary[600]} />
                <Text style={styles.trustBadgeText}>256-bit encrypted</Text>
              </View>
              <View style={styles.trustBadgeSeparator} />
              <View style={styles.trustBadge}>
                <Sparkles size={14} color={colors.teal[600]} />
                <Text style={styles.trustBadgeText}>AI-powered</Text>
              </View>
            </View>
          </>
        )}

        {isFiltering && (
          <TouchableOpacity
            style={styles.clearFiltersButton}
            onPress={() => {
              setSearch('');
              setSelectedCategory('all');
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.clearFiltersText}>Clear all filters</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Background gradient at top */}
      <LinearGradient
        colors={[colors.primary[50], colors.slate[50]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.bgGradient}
      />

      {loading && documents.length === 0 ? (
        <>
          {renderHeader()}
          <LoadingSpinner fullScreen />
        </>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={renderDocumentCard}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmptyState}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={refetch}
              tintColor={colors.primary[600]}
              colors={[colors.primary[600]]}
            />
          }
        />
      )}
      <ConfirmModal
        visible={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Document"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
      />
    </SafeAreaView>
  );
}

// ── Styles ───────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.slate[50],
  },
  bgGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 200,
  },
  listContent: {
    paddingBottom: spacing.xl,
  },

  // ── Header ─────────────────────────────────────────────────────────
  headerSection: {
    paddingTop: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.lg,
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  titleTextGroup: {
    flex: 1,
  },
  title: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[500],
    marginTop: 2,
  },
  addButton: {
    shadowColor: colors.primary[600],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  addButtonGradient: {
    width: 44,
    height: 44,
    borderRadius: borderRadius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Search ─────────────────────────────────────────────────────────
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.white,
    borderRadius: borderRadius.xl,
    borderWidth: 1,
    borderColor: colors.slate[200],
    paddingHorizontal: spacing.md,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  searchIconContainer: {
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: typography.fontSize.base,
    color: colors.slate[900],
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
  },
  searchClear: {
    paddingLeft: spacing.sm,
  },
  searchClearText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary[600],
    fontWeight: typography.fontWeight.medium,
  },

  // ── Filters ────────────────────────────────────────────────────────
  filterRow: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  filterChip: {
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.slate[200],
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  filterChipActive: {
    borderWidth: 0,
    shadowColor: colors.primary[600],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  filterChipGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
  },
  filterChipInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  filterText: {
    fontSize: typography.fontSize.sm,
    color: colors.slate[600],
    fontWeight: typography.fontWeight.medium,
  },
  filterTextActive: {
    color: colors.white,
    fontWeight: typography.fontWeight.semibold,
    fontSize: typography.fontSize.sm,
  },
  chipCount: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: borderRadius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
    minWidth: 20,
    alignItems: 'center',
  },
  chipCountText: {
    color: colors.white,
    fontSize: 11,
    fontWeight: typography.fontWeight.bold,
  },

  // ── Results bar ────────────────────────────────────────────────────
  resultsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  resultsText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
  },

  // ── Document Card ──────────────────────────────────────────────────
  cardTouchable: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  docCard: {
    marginBottom: 0,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  categoryIconBox: {
    width: 40,
    height: 40,
    borderRadius: borderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: {
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
  },
  docName: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semibold,
    color: colors.slate[900],
    letterSpacing: -0.1,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  categoryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: typography.fontWeight.medium,
  },
  metaSeparator: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.slate[300],
    marginHorizontal: 2,
  },
  metaText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
  },

  // ── Status pill ────────────────────────────────────────────────────
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.full,
  },
  statusText: {
    fontSize: 11,
    fontWeight: typography.fontWeight.semibold,
  },

  // ── Tags ───────────────────────────────────────────────────────────
  tagsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingLeft: 52, // Align with text content (40px icon + 12px gap)
  },
  tagIcon: {
    marginRight: 4,
  },
  tagRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
    flex: 1,
  },
  tagChip: {
    backgroundColor: colors.slate[100],
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  tagText: {
    fontSize: 11,
    color: colors.slate[600],
    fontWeight: typography.fontWeight.medium,
  },
  moreTag: {
    fontSize: 11,
    color: colors.slate[400],
    alignSelf: 'center',
    fontWeight: typography.fontWeight.medium,
  },

  // ── Expiration row ─────────────────────────────────────────────────
  expirationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingLeft: 52,
  },
  expirationText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[400],
  },

  // ── Card divider ───────────────────────────────────────────────────
  cardDivider: {
    height: 1,
    backgroundColor: colors.slate[100],
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    marginHorizontal: -spacing.lg, // Extend to card edges
  },

  // ── Action row ─────────────────────────────────────────────────────
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  actionButtonText: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.primary[600],
  },
  actionSeparator: {
    width: 1,
    height: 20,
    backgroundColor: colors.slate[100],
  },

  // ── Empty State ────────────────────────────────────────────────────
  emptyContainer: {
    alignItems: 'center',
    paddingTop: spacing['4xl'],
    paddingHorizontal: spacing['3xl'],
  },
  emptyIconOuter: {
    marginBottom: spacing['2xl'],
  },
  emptyIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary[600],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  emptyTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.slate[900],
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: typography.fontSize.base,
    color: colors.slate[500],
    textAlign: 'center',
    lineHeight: typography.fontSize.base * typography.lineHeight.relaxed,
    marginBottom: spacing['2xl'],
  },
  emptyButton: {
    marginBottom: spacing['2xl'],
  },
  trustBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.slate[200],
  },
  trustBadgeText: {
    fontSize: typography.fontSize.xs,
    color: colors.slate[600],
    fontWeight: typography.fontWeight.medium,
  },
  trustBadgeSeparator: {
    width: 1,
    height: 16,
    backgroundColor: colors.slate[200],
  },
  clearFiltersButton: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.full,
    borderWidth: 1,
    borderColor: colors.primary[200],
    backgroundColor: colors.primary[50],
  },
  clearFiltersText: {
    color: colors.primary[700],
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
  },
});
