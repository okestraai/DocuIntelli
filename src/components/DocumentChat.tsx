import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Send, MessageSquare, FileText, Lightbulb } from 'lucide-react';
import type { Document } from '../App';
import { useFeedback } from '../hooks/useFeedback';

interface DocumentChatProps {
  document: Document;
  onBack: () => void;
}

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  reference?: string;
}

export function DocumentChat({ document, onBack }: DocumentChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: `Hi! I'm ready to help you understand your ${document.name}. You can ask me questions like "What's covered?", "How do I file a claim?", or "What are the renewal terms?". What would you like to know?`,
      timestamp: new Date(),
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const feedback = useFeedback();

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
    setInputValue('');
    setIsLoading(true);

    try {
      // Simulate AI response with potential failure
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          // Simulate occasional failures for demo
          if (Math.random() < 0.1) {
            reject(new Error('AI service temporarily unavailable'));
          } else {
            resolve(null);
          }
        }, 1000 + Math.random() * 2000);
      });

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: getSimulatedResponse(inputValue, document),
        timestamp: new Date(),
        reference: 'Section 3.2 of your policy document'
      };
      
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat AI error:', error);
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

  const getSimulatedResponse = (question: string, doc: Document): string => {
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('covered') || lowerQuestion.includes('coverage')) {
      if (doc.category === 'insurance') {
        return "Based on your insurance policy, you're covered for collision damage (with $500 deductible), comprehensive coverage (with $250 deductible), liability protection up to $100,000, and uninsured motorist protection. Glass damage and roadside assistance are also included.";
      } else if (doc.category === 'warranty') {
        return "Your warranty covers manufacturing defects, component failures, and normal wear issues for all internal components. Coverage includes free repairs, replacement parts, and labor. Water damage and physical damage from drops are not covered.";
      }
    }
    
    if (lowerQuestion.includes('claim') || lowerQuestion.includes('file')) {
      return "To file a claim: 1) Contact the claims hotline at 1-800-555-0123 within 24 hours, 2) Provide your policy number and incident details, 3) Schedule an inspection if required, 4) Keep all receipts and documentation. Claims are typically processed within 5-7 business days.";
    }
    
    if (lowerQuestion.includes('cancel') || lowerQuestion.includes('termination')) {
      return "You can cancel this agreement with 30 days written notice. If cancelled within the first year, there's a $150 early termination fee. After one year, you can cancel without penalty. Refunds are prorated based on unused coverage period.";
    }
    
    if (lowerQuestion.includes('expire') || lowerQuestion.includes('renewal')) {
      return `This document expires on ${doc.expirationDate ? new Date(doc.expirationDate).toLocaleDateString() : 'the specified date'}. You'll receive renewal notices 60 days before expiration. The renewal process is automatic unless you opt out, and rates may be adjusted based on current market conditions.`;
    }
    
    return "I understand your question. Based on the document, I can help you find the specific information you need. Could you be more specific about which section or aspect you'd like me to focus on?";
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
                  <p className="text-sm">{message.content}</p>
                  {message.reference && (
                    <p className="text-xs mt-2 opacity-75 italic">
                      Reference: {message.reference}
                    </p>
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
        </div>

        {/* Suggested Questions */}
        {messages.length === 1 && (
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