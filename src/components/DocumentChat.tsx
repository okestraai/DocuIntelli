import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Send, FileText, Lightbulb } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Document } from '../App';
import { useFeedback } from '../hooks/useFeedback';
import { useSubscription } from '../hooks/useSubscription';
import { chatWithDocument, loadChatHistory } from '../lib/api';

interface DocumentChatProps {
  document: Document;
  onBack: () => void;
  onUpgradeNeeded?: () => void;
}

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  sources?: Array<{
    chunk_index: number;
    similarity: number;
    preview: string;
  }>;
}

export function DocumentChat({ document, onBack, onUpgradeNeeded }: DocumentChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedback = useFeedback();
  const { canAskQuestion, incrementAIQuestions, subscription, loading: subscriptionLoading } = useSubscription();

  useEffect(() => {
    const loadHistory = async () => {
      try {
        setIsLoadingHistory(true);
        const history = await loadChatHistory(document.id);

        if (history.length === 0) {
          setMessages([
            {
              id: '1',
              type: 'assistant',
              content: `Hi! I'm ready to help you understand your ${document.name}. You can ask me questions like "What's covered?", "How do I file a claim?", or "What are the renewal terms?". What would you like to know?`,
              timestamp: new Date(),
            }
          ]);
        } else {
          const loadedMessages: Message[] = history.map((msg: any) => ({
            id: msg.id,
            type: msg.role as 'user' | 'assistant',
            content: msg.content,
            timestamp: new Date(msg.created_at),
          }));
          setMessages(loadedMessages);
        }
      } catch (error) {
        console.error('Failed to load chat history:', error);
        setMessages([
          {
            id: '1',
            type: 'assistant',
            content: `Hi! I'm ready to help you understand your ${document.name}. You can ask me questions like "What's covered?", "How do I file a claim?", or "What are the renewal terms?". What would you like to know?`,
            timestamp: new Date(),
          }
        ]);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [document.id, document.name]);

  const suggestedQuestions = [
    "What is covered under this policy?",
    "How do I file a claim?",
    "What are my cancellation rights?",
    "When does this document expire?",
    "What are the renewal terms?"
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    if (!subscriptionLoading && subscription && !canAskQuestion) {
      if (onUpgradeNeeded) {
        onUpgradeNeeded();
      } else {
        feedback.showError('AI Question Limit Reached', `You've used all ${subscription?.ai_questions_limit || 5} AI questions this month. Upgrade to Pro for more questions.`);
      }
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    const currentQuestion = inputValue;
    setInputValue('');
    setIsLoading(true);

    try {
      // Stream tokens progressively into a new assistant message
      let streamingId = '';

      const result = await chatWithDocument(document.id, currentQuestion, (chunk) => {
        if (!streamingId) {
          // First chunk — create the assistant message
          streamingId = (Date.now() + 1).toString();
          setMessages(prev => [...prev, {
            id: streamingId,
            type: 'assistant' as const,
            content: chunk,
            timestamp: new Date(),
          }]);
        } else {
          // Subsequent chunks — append to existing message
          setMessages(prev => prev.map(msg =>
            msg.id === streamingId ? { ...msg, content: msg.content + chunk } : msg
          ));
        }
      });

      if (result.success) {
        await incrementAIQuestions();

        // Update the streamed message with sources
        if (streamingId && result.sources?.length > 0) {
          setMessages(prev => prev.map(msg =>
            msg.id === streamingId ? { ...msg, sources: result.sources } : msg
          ));
        }

        // Fallback: if no chunks were streamed (e.g. non-streaming response)
        if (!streamingId && result.answer) {
          setMessages(prev => [...prev, {
            id: (Date.now() + 1).toString(),
            type: 'assistant' as const,
            content: result.answer,
            timestamp: new Date(),
            sources: result.sources,
          }]);
        }
      } else {
        throw new Error('Failed to get response');
      }
    } catch (error) {
      console.error('Chat error:', error);
      feedback.showError('Failed to get response', 'The AI assistant is temporarily unavailable. Please try again.');

      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        type: 'assistant' as const,
        content: "I'm sorry, I'm having trouble processing your request right now. Please try again in a moment.",
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    setInputValue(question);
    inputRef.current?.focus();
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 h-[calc(100dvh-7.5rem)] md:h-[calc(100dvh-5rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center mb-4 sm:mb-6">
        <button
          onClick={onBack}
          className="mr-3 sm:mr-4 p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors active:scale-95"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2} />
        </button>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="bg-gradient-to-br from-emerald-50 to-teal-50 w-10 h-10 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
            <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-600" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base sm:text-xl font-semibold text-slate-900 truncate">{document.name}</h1>
            <p className="text-xs sm:text-sm text-slate-500 capitalize truncate">{document.category} • {document.type}</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 bg-white rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
        <div className="flex-1 p-3 sm:p-4 lg:p-6 overflow-y-auto overscroll-contain">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-2 text-slate-500">
                <div className="animate-spin rounded-full h-5 w-5 sm:h-6 sm:w-6 border-2 border-emerald-600 border-t-transparent"></div>
                <span className="text-sm sm:text-base">Loading conversation...</span>
              </div>
            </div>
          ) : (
            <div className="space-y-3 sm:space-y-4">
              {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] sm:max-w-xs lg:max-w-md px-3 sm:px-4 py-2 sm:py-3 rounded-2xl ${
                    message.type === 'user'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-900'
                  }`}
                >
                  {message.type === 'user' ? (
                    <p className="text-sm sm:text-base whitespace-pre-wrap break-words">{message.content}</p>
                  ) : (
                    <div className="text-sm sm:text-base prose prose-sm max-w-none
                      prose-p:my-1 prose-p:leading-relaxed
                      prose-ul:my-2 prose-ul:list-disc prose-ul:pl-4
                      prose-ol:my-2 prose-ol:list-decimal prose-ol:pl-4
                      prose-li:my-0.5
                      prose-strong:font-semibold prose-strong:text-slate-900
                      prose-em:italic
                      prose-headings:font-semibold prose-headings:text-slate-900
                      prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
                      prose-code:bg-slate-200 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                      prose-pre:bg-slate-200 prose-pre:p-2 prose-pre:rounded prose-pre:text-xs
                    ">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.type === 'user' && (
              <div className="flex justify-start">
                <div className="bg-slate-100 text-slate-900 px-3 sm:px-4 py-2 sm:py-3 rounded-2xl">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-emerald-600 border-t-transparent"></div>
                    <span className="text-sm sm:text-base">Generating answer...</span>
                  </div>
                </div>
              </div>
            )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Suggested Questions */}
        {!isLoadingHistory && messages.length === 1 && (
          <div className="border-t border-slate-200 p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="h-4 w-4 text-amber-600" strokeWidth={2} />
              <span className="text-xs sm:text-sm font-medium text-slate-700">Suggested questions:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((question, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestedQuestion(question)}
                  className="text-xs sm:text-sm bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 px-3 py-1.5 rounded-full transition-all active:scale-95 border border-transparent hover:border-emerald-200"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-slate-200 p-3 sm:p-4 safe-area-inset-bottom">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.slice(0, 2000))}
              placeholder="Ask a question..."
              maxLength={2000}
              className="flex-1 border border-slate-300 rounded-lg sm:rounded-xl px-3 sm:px-4 py-2 sm:py-2.5 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm sm:text-base transition-all"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:from-slate-300 disabled:to-slate-300 text-white p-2.5 sm:p-3 rounded-lg sm:rounded-xl transition-all active:scale-95 shadow-md disabled:shadow-none flex-shrink-0"
            >
              <Send className="h-5 w-5" strokeWidth={2} />
            </button>
          </form>
          <p className="text-center text-xs text-slate-400 mt-2">Powered by Okestra AI Labs</p>
        </div>
      </div>
    </div>
  );
}
