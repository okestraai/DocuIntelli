export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
  created_at: string;
}

export interface ChatSource {
  document_id: string;
  document_name: string;
  chunk_index: number;
  similarity: number;
}
