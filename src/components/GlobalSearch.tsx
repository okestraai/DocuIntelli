import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search, X, FileText, Crown, Lock, Loader2, AlertCircle,
  ChevronRight, MessageSquare, Send, Sparkles,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import {
  globalSearch,
  GlobalSearchResultGroup,
  globalChatStream,
  loadGlobalChatHistory,
  GlobalChatSource,
} from '../lib/api';
import { useSubscription } from '../hooks/useSubscription';
import { usePricing } from '../hooks/usePricing';

// ─── Types ──────────────────────────────────────────────────────────

type Mode = 'search' | 'chat';

interface GlobalSearchProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  onNavigateToDocument: (documentId: string) => void;
  onNavigateToDocumentChat: (documentId: string) => void;
  onUpgrade: () => void;
  documents: Array<{ id: string; name: string }>;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: GlobalChatSource[];
  isStreaming?: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Strip any chunk/section/document citation noise the LLM leaks.
 * Catches all known patterns: (chunk 5), (docname, chunk 39),
 * (section 3), chunk 5:, From 'doc':, [[doc]], etc.
 */
function cleanLLMOutput(text: string): string {
  let c = text;
  // ANY parenthesized text containing "chunk" or "section" + a number
  // e.g. (chunk 5), (github test, chunk 39), (section 3), (chunks 1-4)
  c = c.replace(/\s*\([^)]*\bchunks?\s*\d+[^)]*\)/gi, '');
  c = c.replace(/\s*\([^)]*\bsections?\s*\d+[^)]*\)/gi, '');
  // Standalone "chunk 5:" or "section 3:"
  c = c.replace(/\bchunks?\s*\d+\s*:/gi, '');
  c = c.replace(/\bsections?\s*\d+\s*:/gi, '');
  // "From 'docname':" or "From: docname" citation patterns
  c = c.replace(/\bFrom[:\s]+['""'][^'""']+['""']\s*:?/gi, '');
  // [[Document Name]]
  c = c.replace(/\[\[[^\]]+\]\]/g, '');
  // Collapse multiple spaces and trim
  c = c.replace(/  +/g, ' ').replace(/\n /g, '\n');
  return c.trim();
}

// ─── Constants ──────────────────────────────────────────────────────

const CATEGORIES = [
  { value: '', label: 'All Categories' },
  { value: 'warranty', label: 'Warranty' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'lease', label: 'Lease' },
  { value: 'employment', label: 'Employment' },
  { value: 'contract', label: 'Contract' },
  { value: 'other', label: 'Other' },
];

const CATEGORY_COLORS: Record<string, string> = {
  warranty: 'bg-blue-100 text-blue-700',
  insurance: 'bg-purple-100 text-purple-700',
  lease: 'bg-amber-100 text-amber-700',
  employment: 'bg-green-100 text-green-700',
  contract: 'bg-red-100 text-red-700',
  other: 'bg-slate-100 text-slate-700',
};

// ─── Component ──────────────────────────────────────────────────────

export function GlobalSearch({
  isOpen,
  onToggle,
  onClose,
  onNavigateToDocument,
  onNavigateToDocumentChat,
  onUpgrade,
  documents,
}: GlobalSearchProps) {
  const { subscription } = useSubscription();
  const { plans } = usePricing();
  const isPro = subscription?.plan === 'pro';

  // --- Shared state ---
  const [mode, setMode] = useState<Mode>('search');

  // --- Search state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [category, setCategory] = useState('');
  const [results, setResults] = useState<GlobalSearchResultGroup[]>([]);
  const [totalChunks, setTotalChunks] = useState(0);
  const [queryTimeMs, setQueryTimeMs] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // --- Chat state ---
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isChatHistoryLoading, setIsChatHistoryLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false);

  // --- @-mention state ---
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionResults, setMentionResults] = useState<Array<{ id: string; name: string }>>([]);
  const [mentionIndex, setMentionIndex] = useState(0);

  // --- Refs ---
  const searchInputRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // ─── Auto-focus ───────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen && isPro) {
      setTimeout(() => {
        if (mode === 'search') searchInputRef.current?.focus();
        else chatInputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, isPro, mode]);

  // ─── Close on click outside ───────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  // ─── Scroll chat to bottom ────────────────────────────────────────
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // ─── Load chat history when chat tab opens ────────────────────────
  useEffect(() => {
    if (!isOpen || mode !== 'chat' || !isPro || chatHistoryLoaded) return;

    let cancelled = false;
    setIsChatHistoryLoading(true);

    loadGlobalChatHistory()
      .then((history) => {
        if (cancelled) return;
        if (history.length > 0) {
          setChatMessages(
            history.map((msg) => ({
              id: msg.id,
              role: msg.role as 'user' | 'assistant',
              content: msg.content,
              sources: msg.sources,
            }))
          );
        }
        setChatHistoryLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setChatHistoryLoaded(true);
      })
      .finally(() => {
        if (!cancelled) setIsChatHistoryLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, mode, isPro, chatHistoryLoaded]);

  // ─── Reset search state when panel closes ─────────────────────────
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setSearchQuery('');
        setCategory('');
        setResults([]);
        setSearchError(null);
        setHasSearched(false);
        setTotalChunks(0);
        setMentionQuery(null);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // ─── Search logic (unchanged from original) ──────────────────────
  const doSearch = useCallback(async (q: string, cat: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setHasSearched(false);
      setTotalChunks(0);
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const response = await globalSearch(q, {
        category: cat || undefined,
        limit: 20,
      });
      setResults(response.results);
      setTotalChunks(response.total_chunks);
      setQueryTimeMs(response.query_time_ms);
      setHasSearched(true);
    } catch (err: any) {
      if (err.code === 'FEATURE_NOT_AVAILABLE') {
        setSearchError('pro_required');
      } else {
        setSearchError(err.message || 'Search failed');
      }
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchQueryChange = (value: string) => {
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value, category), 350);
  };

  const handleCategoryChange = (value: string) => {
    setCategory(value);
    if (searchQuery.trim().length >= 2) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => doSearch(searchQuery, value), 200);
    }
  };

  const handleSearchResultClick = (documentId: string) => {
    onNavigateToDocument(documentId);
    onClose();
  };

  // ─── Chat logic ───────────────────────────────────────────────────
  const handleSendChat = async () => {
    const question = chatInput.trim();
    if (!question || isChatLoading) return;

    setChatError(null);
    setMentionQuery(null);

    // Add user message
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: question,
    };

    // Add placeholder assistant message for streaming
    const assistantMsg: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: '',
      isStreaming: true,
    };

    setChatMessages((prev) => [...prev, userMsg, assistantMsg]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const result = await globalChatStream(question, (chunk) => {
        setChatMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last && last.isStreaming) {
            updated[updated.length - 1] = { ...last, content: last.content + chunk };
          }
          return updated;
        });
      });

      // Finalize the assistant message with sources
      setChatMessages((prev) => {
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
      // Remove the empty streaming message on error
      setChatMessages((prev) => {
        const updated = [...prev];
        if (updated[updated.length - 1]?.isStreaming) {
          updated.pop();
        }
        return updated;
      });
      setChatError(err.message || 'Chat failed');
    } finally {
      setIsChatLoading(false);
    }
  };

  // ─── @-mention handling ───────────────────────────────────────────
  const handleChatInputChange = (value: string) => {
    setChatInput(value);

    // Detect @-mention: look for @ followed by characters at the current cursor position
    const atMatch = value.match(/@([^\s@]*)$/);
    if (atMatch) {
      const q = atMatch[1].toLowerCase();
      const filtered = documents
        .filter((d) => d.name.toLowerCase().includes(q))
        .slice(0, 5);
      setMentionQuery(atMatch[1]);
      setMentionResults(filtered);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
      setMentionResults([]);
    }
  };

  const handleMentionSelect = (doc: { id: string; name: string }) => {
    // Replace the @partial with @DocumentName
    const newValue = chatInput.replace(/@([^\s@]*)$/, `@${doc.name} `);
    setChatInput(newValue);
    setMentionQuery(null);
    setMentionResults([]);
    chatInputRef.current?.focus();
  };

  const handleChatKeyDown = (e: React.KeyboardEvent) => {
    // @-mention navigation
    if (mentionQuery !== null && mentionResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % mentionResults.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + mentionResults.length) % mentionResults.length);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        handleMentionSelect(mentionResults[mentionIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    // Send on Enter (without mention dropdown open)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  const proPrice = plans.find((p) => p.id === 'pro')?.price.monthly ?? 19;

  // ─── Gate Panel (non-Pro) ─────────────────────────────────────────
  const renderGatePanel = () => (
    <div className="p-6 text-center">
      <div className="inline-flex items-center justify-center bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl p-3 mb-4">
        <Sparkles className="h-8 w-8 text-emerald-600" strokeWidth={2} />
      </div>
      <div className="flex items-center justify-center mb-3">
        <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold text-xs px-2.5 py-1 rounded-full">
          <Crown className="h-3 w-3" />
          Pro Feature
        </span>
      </div>
      <h3 className="text-lg font-bold text-slate-900 mb-1.5">Global Search & Chat</h3>
      <p className="text-sm text-slate-600 mb-5">
        Search and chat across all your documents with AI. Find any clause, term, or detail in seconds — or ask questions that span multiple documents.
      </p>
      <button
        onClick={onUpgrade}
        className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-semibold rounded-xl hover:from-emerald-700 hover:to-teal-700 shadow-md hover:shadow-xl transform hover:-translate-y-0.5 transition-all py-2.5 px-6"
      >
        <Lock className="h-4 w-4" />
        Upgrade to Pro
      </button>
      <p className="text-xs text-slate-500 mt-3">${proPrice}/mo — cancel anytime</p>
    </div>
  );

  // ─── Search Panel (identical to original) ─────────────────────────
  const renderSearchPanel = () => (
    <>
      {/* Search input */}
      <div className="p-3 border-b border-slate-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearchQueryChange(e.target.value)}
            placeholder="Search all documents..."
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors"
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 animate-spin" />
          )}
        </div>
        {/* Category filter */}
        <div className="flex gap-1.5 mt-2 overflow-x-auto pb-1 scrollbar-hide">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => handleCategoryChange(cat.value)}
              className={`flex-shrink-0 px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                category === cat.value
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {searchError && searchError !== 'pro_required' && (
          <div className="p-4 text-center">
            <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
            <p className="text-sm text-red-600">{searchError}</p>
          </div>
        )}

        {!searchError && !isSearching && !hasSearched && searchQuery.length < 2 && (
          <div className="p-6 text-center">
            <Search className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">Type at least 2 characters to search across all your documents</p>
          </div>
        )}

        {!searchError && !isSearching && hasSearched && results.length === 0 && (
          <div className="p-6 text-center">
            <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500 font-medium">No results found</p>
            <p className="text-xs text-slate-400 mt-1">Try broader search terms or remove filters</p>
          </div>
        )}

        {results.length > 0 && (
          <div className="divide-y divide-slate-100">
            {results.map((group) => (
              <button
                key={group.document_id}
                onClick={() => handleSearchResultClick(group.document_id)}
                className="w-full text-left p-3 hover:bg-slate-50 transition-colors group"
              >
                {/* Document header */}
                <div className="flex items-center gap-2 mb-1.5">
                  <FileText className="h-4 w-4 text-slate-400 flex-shrink-0" />
                  <span className="text-sm font-medium text-slate-900 truncate flex-1">
                    {group.document_name}
                  </span>
                  <span className={`flex-shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${CATEGORY_COLORS[group.document_category] || CATEGORY_COLORS.other}`}>
                    {group.document_category}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-emerald-500 flex-shrink-0 transition-colors" />
                </div>
                {/* Matching chunks */}
                {group.matches.slice(0, 2).map((match) => (
                  <p
                    key={match.chunk_id}
                    className="text-xs text-slate-500 leading-relaxed ml-6 mb-1 line-clamp-2"
                    dangerouslySetInnerHTML={{ __html: match.highlight }}
                  />
                ))}
                {group.matches.length > 2 && (
                  <p className="text-[10px] text-slate-400 ml-6">
                    +{group.matches.length - 2} more match{group.matches.length - 2 !== 1 ? 'es' : ''}
                  </p>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer summary */}
      {hasSearched && results.length > 0 && (
        <div className="px-3 py-2 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          <p className="text-[10px] text-slate-400 text-center">
            {totalChunks} match{totalChunks !== 1 ? 'es' : ''} across {results.length} document{results.length !== 1 ? 's' : ''} — {queryTimeMs}ms
          </p>
        </div>
      )}
    </>
  );

  // ─── Chat Panel ───────────────────────────────────────────────────
  const renderChatPanel = () => (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Chat messages */}
      <div ref={chatScrollRef} className="flex-1 overflow-y-auto min-h-0 p-3 space-y-3">
        {isChatHistoryLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 text-emerald-500 animate-spin" />
            <span className="ml-2 text-sm text-slate-400">Loading history...</span>
          </div>
        )}

        {!isChatHistoryLoading && chatMessages.length === 0 && (
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center bg-gradient-to-br from-emerald-100 to-teal-100 rounded-2xl p-3 mb-3">
              <MessageSquare className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="text-sm font-medium text-slate-700 mb-1">Ask me anything</p>
            <p className="text-xs text-slate-500 leading-relaxed max-w-[260px] mx-auto">
              Chat across all your documents. Use <span className="font-mono bg-slate-100 px-1 rounded text-emerald-600">@DocumentName</span> to focus on a specific one.
            </p>
          </div>
        )}

        {chatMessages.map((msg) => (
          <div key={msg.id}>
            {/* Message bubble */}
            <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-emerald-600 to-teal-600 text-white'
                    : 'bg-slate-100 text-slate-800'
                }`}
              >
                {msg.role === 'assistant' ? (
                  <div className="prose prose-sm prose-slate max-w-none [&>p]:mb-1.5 [&>p:last-child]:mb-0 [&>ul]:mb-1.5 [&>ol]:mb-1.5">
                    <ReactMarkdown>{cleanLLMOutput(msg.content) || (msg.isStreaming ? '...' : '')}</ReactMarkdown>
                    {msg.isStreaming && msg.content && (
                      <span className="inline-block w-1.5 h-4 bg-emerald-500 animate-pulse ml-0.5 rounded-sm align-text-bottom" />
                    )}
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>

            {/* Source tags — below assistant messages */}
            {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && !msg.isStreaming && (
              <div className="flex flex-wrap gap-1.5 mt-1.5 ml-1">
                {/* Deduplicate sources by document_id */}
                {Array.from(new Map(msg.sources.map((s) => [s.document_id, s])).values()).map((source) => (
                  <button
                    key={source.document_id}
                    onClick={() => {
                      onNavigateToDocumentChat(source.document_id);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-full px-2 py-0.5 transition-colors"
                    title={`Open chat with ${source.document_name}`}
                  >
                    <FileText className="h-2.5 w-2.5" />
                    <span className="truncate max-w-[120px]">{source.document_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Chat error */}
      {chatError && (
        <div className="px-3 py-2 border-t border-red-100 bg-red-50">
          <p className="text-xs text-red-600 text-center">{chatError}</p>
        </div>
      )}

      {/* Chat input */}
      <div className="p-3 border-t border-slate-200 relative">
        {/* @-mention autocomplete dropdown */}
        {mentionQuery !== null && mentionResults.length > 0 && (
          <div className="absolute bottom-full left-3 right-3 mb-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-10">
            {mentionResults.map((doc, i) => (
              <button
                key={doc.id}
                onClick={() => handleMentionSelect(doc)}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${
                  i === mentionIndex
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <FileText className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                <span className="truncate">{doc.name}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            ref={chatInputRef}
            type="text"
            value={chatInput}
            onChange={(e) => handleChatInputChange(e.target.value)}
            onKeyDown={handleChatKeyDown}
            placeholder="Ask about your documents... (@ to mention)"
            disabled={isChatLoading}
            className="flex-1 px-3 py-2.5 text-sm border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-colors disabled:opacity-50"
          />
          <button
            onClick={handleSendChat}
            disabled={!chatInput.trim() || isChatLoading}
            className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white flex items-center justify-center hover:from-emerald-700 hover:to-teal-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            {isChatLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-center text-[10px] text-slate-400 mt-1.5">Powered by Okestra AI Labs</p>
      </div>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <>
      {/* Floating trigger button — Okestra AI branding */}
      <div className="fixed z-40 bottom-[5.5rem] right-4 md:bottom-8 md:right-8 flex flex-col items-center gap-1.5">
        {!isOpen && (
          <span className="text-[9px] font-semibold text-slate-500 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-full shadow-sm border border-slate-200 whitespace-nowrap">
            Powered by Okestra AI
          </span>
        )}
        <button
          onClick={onToggle}
          className={`rounded-full shadow-lg flex items-center justify-center transition-all duration-200
            w-14 h-14 md:w-16 md:h-16
            ${isOpen
              ? 'bg-slate-700 hover:bg-slate-800 scale-90'
              : 'bg-gradient-to-br from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 hover:scale-110 hover:shadow-xl'
            }`}
          title={isOpen ? 'Close' : 'Search & Chat (Ctrl+K)'}
          aria-label="Global search and chat"
        >
          {isOpen ? (
            <X className="h-5 w-5 md:h-6 md:w-6 text-white" />
          ) : (
            <span className="text-white font-black text-lg md:text-xl tracking-tighter select-none">O</span>
          )}
        </button>
      </div>

      {/* Panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="fixed z-50 bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col
            bottom-[9rem] right-4 w-[calc(100vw-2rem)] max-w-md max-h-[75vh]
            md:bottom-28 md:right-8 md:w-[26rem] md:max-h-[80vh]"
        >
          {/* Header with mode tabs */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className="bg-gradient-to-br from-emerald-100 to-teal-100 rounded-lg p-1.5">
                <Sparkles className="h-4 w-4 text-emerald-600" />
              </div>
              {isPro && (
                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">PRO</span>
              )}
            </div>

            {/* Mode toggle */}
            {isPro && (
              <div className="flex bg-slate-100 rounded-lg p-0.5">
                <button
                  onClick={() => setMode('search')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                    mode === 'search'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Search className="h-3 w-3" />
                  Search
                </button>
                <button
                  onClick={() => setMode('chat')}
                  className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                    mode === 'chat'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <MessageSquare className="h-3 w-3" />
                  Chat
                </button>
              </div>
            )}

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          {!isPro
            ? renderGatePanel()
            : mode === 'search'
              ? renderSearchPanel()
              : renderChatPanel()}
        </div>
      )}
    </>
  );
}
