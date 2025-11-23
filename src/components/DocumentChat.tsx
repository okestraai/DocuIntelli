import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Send, FileText, Lightbulb } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { Document } from '../App';
import { useFeedback } from '../hooks/useFeedback';
import { chatWithDocument, loadChatHistory } from '../lib/api';

interface DocumentChatProps {
  document: Document;
  onBack: () => void;
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

export function DocumentChat({ document, onBack }: DocumentChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedback = useFeedback();

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
      const result = await chatWithDocument(document.id, currentQuestion);

      if (result.success) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: result.answer,
          timestamp: new Date(),
          sources: result.sources,
        };

        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error(result.error || 'Failed to get response');
      }
    } catch (error) {
      console.error('❌ Chat error:', error);
      feedback.showError('Failed to get response', 'The AI assistant is temporarily unavailable. Please try again.');

      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: "I'm sorry, I'm having trouble processing your request right now. Please try again in a moment.",
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestedQuestion = (question: string) => {
    setInputValue(question);
    inputRef.current?.focus();
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center mb-6">
        <button
          onClick={onBack}
          className="mr-4 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center space-x-3">
          <div className="bg-blue-100 w-10 h-10 rounded-lg flex items-center justify-center">
            <FileText className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{document.name}</h1>
            <p className="text-sm text-gray-500 capitalize">{document.category} • {document.type}</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
        <div className="flex-1 p-6 overflow-y-auto">
          {isLoadingHistory ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center space-x-2 text-gray-500">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent"></div>
                <span>Loading conversation...</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                    message.type === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {message.type === 'user' ? (
                    <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  ) : (
                    <>
                      <div className="text-sm prose prose-sm max-w-none
                        prose-p:my-1 prose-p:leading-relaxed
                        prose-ul:my-2 prose-ul:list-disc prose-ul:pl-4
                        prose-ol:my-2 prose-ol:list-decimal prose-ol:pl-4
                        prose-li:my-0.5
                        prose-strong:font-semibold prose-strong:text-gray-900
                        prose-em:italic
                        prose-headings:font-semibold prose-headings:text-gray-900
                        prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
                        prose-code:bg-gray-200 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                        prose-pre:bg-gray-200 prose-pre:p-2 prose-pre:rounded prose-pre:text-xs
                      ">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                      </div>
                      {message.sources && message.sources.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-200">
                          <p className="text-xs text-gray-600 mb-1">Sources:</p>
                          {message.sources.map((source, idx) => (
                            <div key={idx} className="text-xs text-gray-500 mb-1">
                              <span className="font-medium">Chunk {source.chunk_index}</span>
                              <span className="text-gray-400"> • {Math.round(source.similarity * 100)}% match</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-900 px-4 py-2 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent"></div>
                    <span className="text-sm">Generating answer...</span>
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
          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center space-x-2 mb-3">
              <Lightbulb className="h-4 w-4 text-yellow-600" />
              <span className="text-sm font-medium text-gray-700">Suggested questions:</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestedQuestions.map((question, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestedQuestion(question)}
                  className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded-full transition-colors"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <div className="border-t border-gray-200 p-4">
          <form onSubmit={handleSubmit} className="flex space-x-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Ask a question about this document..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || isLoading}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white p-2 rounded-lg transition-colors"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}