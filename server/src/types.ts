export interface DocumentChunk {
  document_id: string;
  user_id: string;
  chunk_text: string;
  embedding: number[];
}

export interface ProcessingResult {
  success: boolean;
  message: string;
  chunks_processed?: number;
  error?: string;
}

export interface FileProcessingRequest {
  file: Express.Multer.File;
  document_id: string;
  user_id: string;
}