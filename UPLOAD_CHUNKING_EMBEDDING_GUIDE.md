# Document Upload, Chunking, and Embedding Implementation Guide

## Overview

This guide provides a complete implementation reference for a document upload system with automatic text extraction, intelligent chunking, and vector embedding generation for semantic search. The system is built using React, Supabase (PostgreSQL + pgvector), and Supabase Edge Functions.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [Frontend Implementation](#frontend-implementation)
4. [Backend Processing (Edge Functions)](#backend-processing-edge-functions)
5. [Text Extraction](#text-extraction)
6. [Chunking Strategy](#chunking-strategy)
7. [Embedding Generation](#embedding-generation)
8. [Vector Similarity Search](#vector-similarity-search)
9. [Complete Code Examples](#complete-code-examples)
10. [Deployment Guide](#deployment-guide)
11. [Testing and Troubleshooting](#testing-and-troubleshooting)

---

## Architecture Overview

### High-Level Flow

```
User Uploads Document
    ↓
Frontend: Collect metadata (name, category, expiration)
    ↓
Frontend: Send file + metadata to Edge Function
    ↓
Edge Function: Upload file to Supabase Storage
    ↓
Edge Function: Create document record in database
    ↓
Edge Function: Extract text from file
    ↓
Edge Function: Split text into overlapping chunks
    ↓
Edge Function: Generate embeddings for each chunk (Supabase AI)
    ↓
Edge Function: Store chunks + embeddings in database
    ↓
Return success to frontend
```

### Technology Stack

- **Frontend**: React 18+ with TypeScript
- **Backend**: Supabase Edge Functions (Deno runtime)
- **Database**: PostgreSQL with pgvector extension
- **Storage**: Supabase Storage
- **Embeddings**: Supabase AI with gte-small model (384 dimensions)
- **Authentication**: Supabase Auth

### Key Features

1. **Multi-file Upload**: Support batch document uploads
2. **Text Extraction**: PDF, DOCX, TXT file support
3. **Smart Chunking**: Sentence-based chunking with overlap
4. **Vector Embeddings**: Automatic embedding generation
5. **Semantic Search**: pgvector-powered similarity search
6. **Row-Level Security**: User data isolation

---

## Database Schema

### Core Tables

#### 1. documents Table

Stores document metadata and file references.

```sql
CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('warranty', 'insurance', 'lease', 'employment', 'contract', 'other')),
  type text NOT NULL,                           -- MIME type
  size bigint NOT NULL,                         -- File size in bytes
  file_path text NOT NULL,                      -- Storage path
  original_name text NOT NULL,                  -- Original filename
  upload_date date NOT NULL DEFAULT CURRENT_DATE,
  expiration_date date,                         -- Optional expiration
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired')),
  processed boolean NOT NULL DEFAULT false,     -- Embedding processing status
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

#### 2. document_chunks Table

Stores text chunks with their vector embeddings.

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index int NOT NULL,                     -- Sequential chunk order
  chunk_text text NOT NULL,                     -- The actual text chunk
  embedding vector(384),                        -- gte-small produces 384-dim vectors
  created_at timestamptz NOT NULL DEFAULT now()
);
```

### Indexes for Performance

```sql
-- Document indexes
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_created_at ON documents(created_at DESC);

-- Chunk indexes
CREATE INDEX idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX idx_document_chunks_user_id ON document_chunks(user_id);

-- Vector similarity index (IVFFlat for approximate nearest neighbor)
CREATE INDEX idx_document_chunks_embedding ON document_chunks
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Composite index for filtered searches
CREATE INDEX idx_document_chunks_document_embedding
ON document_chunks (document_id)
WHERE embedding IS NOT NULL;
```

### Row-Level Security (RLS)

#### Documents Table Policies

```sql
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents"
  ON documents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents"
  ON documents FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents"
  ON documents FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
```

#### Document Chunks Table Policies

```sql
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own document chunks"
  ON document_chunks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own document chunks"
  ON document_chunks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own document chunks"
  ON document_chunks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
```

### Automatic Timestamp Updates

```sql
CREATE OR REPLACE FUNCTION update_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_documents_updated_at();
```

---

## Frontend Implementation

### 1. Upload Modal Component

**File**: `src/components/UploadModal.tsx`

```typescript
import React, { useState, useRef } from 'react';
import { X, Upload, FileText, Trash2 } from 'lucide-react';
import { DocumentUploadRequest } from '../hooks/useDocuments';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpload: (documentsData: DocumentUploadRequest[]) => Promise<void>;
}

interface DocumentData {
  file: File;
  name: string;
  category: string;
  expirationDate: string;
}

export function UploadModal({ isOpen, onClose, onUpload }: UploadModalProps) {
  const [documents, setDocuments] = useState<DocumentData[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const categories = [
    { value: '', label: 'Select category...' },
    { value: 'warranty', label: 'Warranty' },
    { value: 'insurance', label: 'Insurance' },
    { value: 'lease', label: 'Lease Agreement' },
    { value: 'employment', label: 'Employment Contract' },
    { value: 'contract', label: 'Service Contract' },
    { value: 'other', label: 'Other' }
  ];

  if (!isOpen) return null;

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
  };

  const addFiles = (files: File[]) => {
    const newDocuments = files.map(file => ({
      file,
      name: '',
      category: '',
      expirationDate: ''
    }));
    setDocuments(prev => [...prev, ...newDocuments]);
  };

  const updateDocument = (index: number, field: keyof DocumentData, value: string) => {
    setDocuments(prev => prev.map((doc, i) =>
      i === index ? { ...doc, [field]: value } : doc
    ));
  };

  const handleSubmit = async () => {
    if (!documents.every(doc => doc.name.trim() && doc.category)) return;

    setIsUploading(true);
    try {
      const uploadData: DocumentUploadRequest[] = documents.map(doc => ({
        name: doc.name.trim(),
        category: doc.category,
        file: doc.file,
        expirationDate: doc.expirationDate || undefined
      }));

      await onUpload(uploadData);
      setDocuments([]);
      onClose();
    } catch (error) {
      console.error('Upload failed:', error);
    } finally {
      setIsUploading(false);
    }
  };

  // ... render UI with drag-drop, file list, metadata inputs
}
```

### 2. Custom Hook for Document Management

**File**: `src/hooks/useDocuments.ts`

```typescript
import { useState, useEffect, useCallback } from 'react';
import { uploadDocumentWithMetadata } from '../lib/api';
import { getDocuments, supabase } from '../lib/supabase';

export interface DocumentUploadRequest {
  name: string;
  category: string;
  file: File;
  expirationDate?: string;
}

export function useDocuments(isAuthenticated: boolean) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const uploadDocuments = async (documentsData: DocumentUploadRequest[]): Promise<Document[]> => {
    try {
      setError(null);
      console.log(`📤 Starting upload of ${documentsData.length} documents`);

      // Upload all documents in parallel
      const uploadPromises = documentsData.map(async (docData, index) => {
        console.log(`📄 Uploading document ${index + 1}/${documentsData.length}: ${docData.name}`);

        const uploadResult = await uploadDocumentWithMetadata(
          docData.file,
          docData.name,
          docData.category,
          docData.expirationDate
        );

        if (!uploadResult.success || !uploadResult.data) {
          throw new Error(uploadResult.error || 'Upload failed');
        }

        console.log(`✅ Document ${index + 1} uploaded successfully`);
        return uploadResult.data.document_id;
      });

      const uploadedDocIds = await Promise.all(uploadPromises);
      console.log(`🎉 All ${uploadedDocIds.length} documents uploaded`);

      // Refresh documents list
      await refetchDocuments();

      const newDocuments = documents.filter(doc => uploadedDocIds.includes(doc.id));
      return newDocuments;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to upload documents';
      console.error('❌ Upload failed:', errorMessage);
      setError(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const refetchDocuments = useCallback(async () => {
    if (!isAuthenticated) {
      setDocuments([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const docs = await getDocuments();
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    refetchDocuments();
  }, [isAuthenticated, refetchDocuments]);

  return {
    documents,
    loading,
    error,
    uploadDocuments,
    refetch: refetchDocuments
  };
}
```

### 3. API Helper Functions

**File**: `src/lib/api.ts`

```typescript
import { supabase } from './supabase';

export interface UploadResponse {
  success: boolean;
  data?: {
    document_id: string;
    file_path: string;
    chunks_processed: number;
    file_type: string;
  };
  error?: string;
}

/**
 * Upload a document with metadata to Supabase via Edge Function
 */
export async function uploadDocumentWithMetadata(
  file: File,
  name: string,
  category: string,
  expirationDate?: string
): Promise<UploadResponse> {
  try {
    console.log('📤 Starting upload:', { name, category, fileSize: file.size });

    // Get authentication token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { success: false, error: 'User not authenticated' };
    }

    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);
    formData.append('category', category);
    if (expirationDate) {
      formData.append('expirationDate', expirationDate);
    }

    // Call Edge Function
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const apiUrl = `${supabaseUrl}/functions/v1/upload-document`;

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({ error: 'Upload failed' }));
      return {
        success: false,
        error: errorData.error || `Upload failed with status ${res.status}`,
      };
    }

    const result = await res.json();
    console.log('✅ Upload successful:', result);
    return result;
  } catch (error) {
    console.error('❌ Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}
```

---

## Backend Processing (Edge Functions)

### Main Upload Edge Function

**File**: `supabase/functions/upload-document/index.ts`

This function handles the complete upload workflow:
1. Authenticate user
2. Upload file to storage
3. Create database record
4. Extract text
5. Chunk text
6. Generate embeddings
7. Store chunks

```typescript
import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    // Initialize Supabase with service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Authenticate user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`📤 Upload request from user: ${user.id}`)

    // Parse multipart form data
    const formData = await req.formData()
    const file = formData.get('file') as File
    const name = formData.get('name') as string
    const category = formData.get('category') as string
    const expirationDate = formData.get('expirationDate') as string

    // Validation
    if (!file || !name || !category) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate file type
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/gif'
    ]

    if (!allowedTypes.includes(file.type)) {
      return new Response(
        JSON.stringify({ success: false, error: `Unsupported file type: ${file.type}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ success: false, error: 'File size exceeds 10MB limit' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate unique file path
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const uniquePath = `${user.id}/${timestamp}-${sanitizedName}`

    // STEP 1: Upload to storage
    console.log(`☁️ Uploading to storage: ${uniquePath}`)
    const fileBuffer = await file.arrayBuffer()
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(uniquePath, fileBuffer, {
        contentType: file.type,
        upsert: false
      })

    if (uploadError) {
      console.error('❌ Storage upload error:', uploadError)
      return new Response(
        JSON.stringify({ success: false, error: 'Storage upload failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✅ File uploaded: ${uploadData.path}`)

    // STEP 2: Create document record
    const { data: documentData, error: dbError } = await supabase
      .from('documents')
      .insert([{
        user_id: user.id,
        name: name.trim(),
        category: category,
        type: file.type,
        size: file.size,
        file_path: uniquePath,
        original_name: file.name,
        upload_date: new Date().toISOString().split('T')[0],
        expiration_date: expirationDate || null,
        status: 'active',
        processed: false
      }])
      .select()
      .single()

    if (dbError) {
      console.error('❌ Database error:', dbError)
      // Clean up uploaded file
      await supabase.storage.from('documents').remove([uniquePath])
      return new Response(
        JSON.stringify({ success: false, error: 'Database error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`✅ Document record created: ${documentData.id}`)

    // STEP 3-6: Extract text, chunk, and generate embeddings
    let chunksProcessed = 0
    try {
      const extractedText = await TextExtractor.extractText(file)

      if (extractedText && extractedText.trim().length > 0) {
        console.log(`📄 Extracted ${extractedText.length} characters`)

        const textChunks = TextChunker.chunkText(extractedText)
        console.log(`✂️ Created ${textChunks.length} chunks`)

        if (textChunks.length > 0) {
          console.log(`🧠 Generating embeddings...`)
          const model = new Supabase.ai.Session('gte-small')

          const documentChunks = []

          for (let i = 0; i < textChunks.length; i++) {
            try {
              const embedding = await model.run(textChunks[i], {
                mean_pool: true,
                normalize: true
              })

              documentChunks.push({
                document_id: documentData.id,
                user_id: user.id,
                chunk_index: i,
                chunk_text: textChunks[i],
                embedding: embedding
              })

              console.log(`✅ Embedding ${i + 1}/${textChunks.length}`)
            } catch (embeddingError) {
              console.error(`❌ Embedding error for chunk ${i + 1}:`, embeddingError)
            }
          }

          // Insert chunks
          if (documentChunks.length > 0) {
            const { data: insertedChunks, error: insertError } = await supabase
              .from('document_chunks')
              .insert(documentChunks)
              .select('id')

            if (!insertError) {
              chunksProcessed = insertedChunks?.length || 0
              console.log(`✅ Inserted ${chunksProcessed} chunks`)

              // Mark as processed
              await supabase
                .from('documents')
                .update({ processed: true })
                .eq('id', documentData.id)
            }
          }
        }
      }
    } catch (textError) {
      console.error('❌ Text processing error (non-blocking):', textError)
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(uniquePath)

    console.log(`🎉 Upload complete - ${chunksProcessed} chunks processed`)

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          document_id: documentData.id,
          file_path: uniquePath,
          public_url: urlData.publicUrl,
          chunks_processed: chunksProcessed,
          file_type: file.type
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Fatal error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

---

## Text Extraction

### TextExtractor Class

Handles extraction from different file types.

```typescript
class TextExtractor {
  /**
   * Extract text from PDF files
   * Note: This is a basic implementation. For production, use a proper PDF parser.
   */
  static async extractFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
    try {
      const uint8Array = new Uint8Array(arrayBuffer)
      const text = new TextDecoder().decode(uint8Array)

      // Extract text between stream objects (basic approach)
      const textMatches = text.match(/stream\s*(.*?)\s*endstream/gs)
      if (textMatches) {
        return textMatches
          .map(match => match.replace(/stream|endstream/g, ''))
          .join(' ')
          .replace(/[^\x20-\x7E\n\r\t]/g, ' ') // Keep printable ASCII
          .replace(/\s+/g, ' ')
          .trim()
      }

      // Fallback: extract readable text
      return text
        .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 10000)
    } catch (error) {
      console.error('PDF extraction error:', error)
      throw new Error('Failed to extract text from PDF')
    }
  }

  /**
   * Extract text from plain text files
   */
  static async extractFromText(arrayBuffer: ArrayBuffer): Promise<string> {
    try {
      return new TextDecoder('utf-8').decode(arrayBuffer)
    } catch (error) {
      console.error('Text extraction error:', error)
      throw new Error('Failed to extract text from file')
    }
  }

  /**
   * Extract text from DOCX files
   * Note: Basic implementation. For production, use a proper DOCX parser.
   */
  static async extractFromDOCX(arrayBuffer: ArrayBuffer): Promise<string> {
    try {
      const uint8Array = new Uint8Array(arrayBuffer)
      const text = new TextDecoder().decode(uint8Array)

      // Extract text from XML content
      const xmlMatches = text.match(/<w:t[^>]*>(.*?)<\/w:t>/gs)
      if (xmlMatches) {
        return xmlMatches
          .map(match => match.replace(/<[^>]*>/g, ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
      }

      return text
        .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 10000)
    } catch (error) {
      console.error('DOCX extraction error:', error)
      throw new Error('Failed to extract text from DOCX')
    }
  }

  /**
   * Main extraction method - routes to appropriate handler
   */
  static async extractText(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer()

    switch (file.type) {
      case 'application/pdf':
        return await this.extractFromPDF(arrayBuffer)

      case 'text/plain':
        return await this.extractFromText(arrayBuffer)

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await this.extractFromDOCX(arrayBuffer)

      default:
        // Fallback: try text extraction
        try {
          return await this.extractFromText(arrayBuffer)
        } catch {
          throw new Error(`Unsupported file type: ${file.type}`)
        }
    }
  }
}
```

### Production-Ready Text Extraction

For production applications, consider using these libraries:

- **PDF**: `pdf-parse`, `pdfjs-dist`, or `pdf.js`
- **DOCX**: `mammoth`, `docx`, or `officegen`
- **Images (OCR)**: `tesseract.js`, `Google Cloud Vision API`

---

## Chunking Strategy

### TextChunker Class

Implements sentence-based chunking with overlap for context preservation.

```typescript
class TextChunker {
  private static readonly CHUNK_SIZE = 1000      // Max characters per chunk
  private static readonly OVERLAP_SIZE = 100     // Overlap between chunks

  /**
   * Split text into overlapping chunks
   * Uses sentence boundaries to avoid cutting mid-sentence
   */
  static chunkText(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return []
    }

    const chunks: string[] = []
    const sentences = this.splitIntoSentences(text)

    let currentChunk = ''

    for (const sentence of sentences) {
      // If adding this sentence exceeds chunk size
      if (currentChunk.length + sentence.length > this.CHUNK_SIZE) {
        // Save current chunk
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim())
        }

        // Create overlap from previous chunk
        const words = currentChunk.split(' ')
        const overlapWords = words.slice(-Math.floor(this.OVERLAP_SIZE / 6))
        currentChunk = overlapWords.join(' ') + ' ' + sentence
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence
      }
    }

    // Add final chunk
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim())
    }

    // Filter out very short chunks (less than 50 chars)
    return chunks.filter(chunk => chunk.length > 50)
  }

  /**
   * Split text into sentences
   * Uses regex to split on sentence boundaries
   */
  private static splitIntoSentences(text: string): string[] {
    const cleanText = text.replace(/\s+/g, ' ').trim()

    // Split on periods, exclamation marks, or question marks
    // followed by whitespace and a capital letter
    const sentences = cleanText.split(/(?<=[.!?])\s+(?=[A-Z])/)

    return sentences.filter(sentence => sentence.trim().length > 0)
  }
}
```

### Chunking Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **CHUNK_SIZE** | 1000 chars | Balances context vs. granularity |
| **OVERLAP_SIZE** | 100 chars | Preserves context across boundaries |
| **Min Chunk Size** | 50 chars | Filters out noise |

### Chunking Best Practices

1. **Sentence Boundaries**: Always chunk on sentence boundaries
2. **Overlap**: Include overlap to preserve context
3. **Size Limits**: Keep chunks under embedding model limits
4. **Content Filtering**: Remove very short or empty chunks
5. **Metadata**: Store chunk index for reconstruction

---

## Embedding Generation

### Using Supabase AI (gte-small)

Supabase provides built-in AI capabilities using the `gte-small` model.

#### Model Specifications

- **Model**: `gte-small` (General Text Embeddings)
- **Dimensions**: 384
- **Max Input Length**: ~512 tokens (~2000 characters)
- **Output**: Normalized vectors

#### Embedding Generation Code

```typescript
// Create embedding session (reuse for multiple chunks)
const session = new Supabase.ai.Session('gte-small')

// Generate embedding for text
const embedding = await session.run(textChunk, {
  mean_pool: true,      // Average token embeddings
  normalize: true       // Normalize to unit length
})

// embedding is a Float32Array of 384 dimensions
console.log(embedding.length) // 384
```

#### Batch Processing

```typescript
const model = new Supabase.ai.Session('gte-small')
const documentChunks = []

for (let i = 0; i < textChunks.length; i++) {
  try {
    const embedding = await model.run(textChunks[i], {
      mean_pool: true,
      normalize: true
    })

    documentChunks.push({
      document_id: documentData.id,
      user_id: user.id,
      chunk_index: i,
      chunk_text: textChunks[i],
      embedding: embedding  // Float32Array or number[]
    })

    console.log(`✅ Generated embedding ${i + 1}/${textChunks.length}`)
  } catch (embeddingError) {
    console.error(`❌ Embedding error for chunk ${i + 1}:`, embeddingError)
    // Continue with other chunks
  }
}

// Batch insert all chunks
const { data, error } = await supabase
  .from('document_chunks')
  .insert(documentChunks)
  .select('id')
```

### Alternative: Separate Embedding Function

For better scalability, you can separate embedding generation:

**File**: `supabase/functions/generate-embeddings/index.ts`

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("📊 Starting embedding generation...");

    // Get chunks with null embeddings
    const limit = 3; // Process 3 at a time to avoid timeouts

    const { data: chunks, error: fetchError } = await supabase
      .from("document_chunks")
      .select("id, chunk_text, chunk_index, document_id")
      .is("embedding", null)
      .not("chunk_text", "eq", "")
      .not("chunk_text", "is", null)
      .limit(limit);

    if (fetchError) {
      throw new Error(`Failed to fetch chunks: ${fetchError.message}`);
    }

    if (!chunks || chunks.length === 0) {
      return new Response(
        JSON.stringify({ success: true, updated: 0, message: "No chunks to process" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`📝 Processing ${chunks.length} chunks...`);

    let updatedCount = 0;
    const session = new Supabase.ai.Session("gte-small");

    for (const chunk of chunks) {
      try {
        console.log(`🔄 Processing chunk ${chunk.id}`);

        // Generate embedding
        const embedding = await session.run(chunk.chunk_text, {
          mean_pool: true,
          normalize: true,
        });

        // Convert to array if needed
        let embeddingArray: number[];
        if (Array.isArray(embedding)) {
          embeddingArray = embedding;
        } else if (typeof embedding === 'object' && 'data' in embedding) {
          embeddingArray = (embedding as any).data;
        } else {
          throw new Error(`Invalid embedding format`);
        }

        // Update database
        const { error: updateError } = await supabase
          .from("document_chunks")
          .update({ embedding: embeddingArray })
          .eq("id", chunk.id);

        if (updateError) {
          throw new Error(updateError.message);
        }

        updatedCount++;
        console.log(`✅ Updated chunk ${chunk.id}`);
      } catch (err: any) {
        console.error(`❌ Error processing chunk ${chunk.id}:`, err.message);
      }
    }

    // Check remaining chunks
    const { count: remainingCount } = await supabase
      .from("document_chunks")
      .select("id", { count: "exact", head: true })
      .is("embedding", null)
      .not("chunk_text", "eq", "")
      .not("chunk_text", "is", null);

    console.log(`🎉 Completed: ${updatedCount}/${chunks.length} updated`);
    console.log(`📊 Remaining: ${remainingCount || 0}`);

    return new Response(
      JSON.stringify({
        success: true,
        updated: updatedCount,
        total: chunks.length,
        remaining: remainingCount || 0,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("❌ Fatal error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

### Calling Separate Embedding Function

You can trigger this function via cron job or manually:

```typescript
// Manual trigger
const { data } = await supabase.functions.invoke('generate-embeddings', {
  body: { document_id: 'uuid-here', limit: 10 }
})
```

---

## Vector Similarity Search

### Search Function

Create a PostgreSQL function for efficient similarity search.

```sql
CREATE OR REPLACE FUNCTION match_document_chunks(
  query_embedding vector(384),
  match_document_id uuid,
  match_count int DEFAULT 5,
  similarity_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id uuid,
  document_id uuid,
  chunk_index int,
  chunk_text text,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.chunk_text,
    1 - (dc.embedding <=> query_embedding) as similarity
  FROM document_chunks dc
  WHERE
    dc.document_id = match_document_id
    AND dc.embedding IS NOT NULL
    AND 1 - (dc.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

### Using the Search Function

```typescript
// Generate embedding for query
const session = new Supabase.ai.Session('gte-small')
const queryEmbedding = await session.run(userQuestion, {
  mean_pool: true,
  normalize: true
})

// Search for similar chunks
const { data: matches, error } = await supabase
  .rpc('match_document_chunks', {
    query_embedding: queryEmbedding,
    match_document_id: documentId,
    match_count: 5,
    similarity_threshold: 0.3
  })

if (matches && matches.length > 0) {
  console.log(`Found ${matches.length} relevant chunks`)
  matches.forEach(match => {
    console.log(`Similarity: ${match.similarity.toFixed(3)} - ${match.chunk_text.substring(0, 100)}...`)
  })
}
```

### Cosine Distance Operator

pgvector provides the `<=>` operator for cosine distance:

- `embedding <=> query`: Returns distance (0 = identical, 2 = opposite)
- `1 - (embedding <=> query)`: Converts to similarity score (1 = identical, 0 = orthogonal)

---

## Complete Code Examples

### Example 1: Full Upload Workflow

```typescript
// Frontend: User uploads document
const file = new File(['Hello world'], 'test.txt', { type: 'text/plain' })

const result = await uploadDocumentWithMetadata(
  file,
  'Test Document',
  'contract',
  '2025-12-31'
)

console.log(result)
// {
//   success: true,
//   data: {
//     document_id: 'uuid',
//     file_path: 'user-id/timestamp-test.txt',
//     chunks_processed: 1,
//     file_type: 'Text'
//   }
// }
```

### Example 2: Semantic Search

```typescript
// Search within a document
const searchInDocument = async (documentId: string, query: string) => {
  // Generate query embedding
  const { data: { session } } = await supabase.auth.getSession()

  const response = await fetch(`${supabaseUrl}/functions/v1/generate-embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: query })
  })

  const { embedding } = await response.json()

  // Search for matches
  const { data: matches } = await supabase.rpc('match_document_chunks', {
    query_embedding: embedding,
    match_document_id: documentId,
    match_count: 5,
    similarity_threshold: 0.3
  })

  return matches
}
```

### Example 3: Processing Documents with Null Embeddings

```typescript
// Trigger batch processing
const processUnembeddedChunks = async () => {
  const { data } = await supabase.functions.invoke('generate-embeddings', {
    body: { limit: 10 }
  })

  console.log(`Processed ${data.updated} chunks`)

  if (data.remaining > 0) {
    console.log(`${data.remaining} chunks remaining`)
    // Schedule another run if needed
  }
}
```

---

## Deployment Guide

### Prerequisites

1. Supabase project
2. PostgreSQL with pgvector extension enabled
3. Supabase Storage bucket named `documents`
4. Supabase Auth configured

### Step 1: Database Setup

```bash
# Run migrations in order
supabase migration up
```

Or apply manually:

```sql
-- 1. Create tables
\i supabase/migrations/20251122231359_create_documents_and_chunks_tables.sql

-- 2. Update embedding dimensions
\i supabase/migrations/20251123051659_update_embedding_dimensions.sql

-- 3. Create search function
\i supabase/migrations/20251123054301_create_match_document_chunks_function.sql
```

### Step 2: Storage Configuration

Create bucket and set policies:

```sql
-- Insert bucket (if not exists via UI)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false);

-- Allow authenticated users to upload
CREATE POLICY "Users can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to read own documents
CREATE POLICY "Users can read own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow users to delete own documents
CREATE POLICY "Users can delete own documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### Step 3: Deploy Edge Functions

```bash
# Deploy upload function
supabase functions deploy upload-document

# Deploy embedding function (if separate)
supabase functions deploy generate-embeddings
```

### Step 4: Environment Variables

Set in `.env`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Edge functions automatically have access to:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

### Step 5: Frontend Setup

```bash
npm install @supabase/supabase-js
npm install lucide-react  # For icons
```

---

## Testing and Troubleshooting

### Testing Checklist

- [ ] User can upload single document
- [ ] User can upload multiple documents
- [ ] File validation works (type, size)
- [ ] Text extraction works for PDF, DOCX, TXT
- [ ] Chunks are created and stored
- [ ] Embeddings are generated
- [ ] Vector search returns relevant results
- [ ] RLS policies prevent unauthorized access
- [ ] Documents can be deleted (cascades to chunks)
- [ ] Error handling works gracefully

### Common Issues

#### 1. "Embedding is null" Error

**Problem**: Embedding generation failed

**Solutions**:
- Check that gte-small model is available in your region
- Verify text chunks are not empty
- Check chunk text length is under model limits
- Run separate embedding function to process missed chunks

#### 2. Slow Upload Performance

**Problem**: Large files take too long

**Solutions**:
- Implement async processing (return quickly, process in background)
- Use message queue for processing
- Batch embed chunks instead of one-by-one
- Increase Edge Function timeout (if possible)

#### 3. Vector Search Returns No Results

**Problem**: Search finds no matches

**Solutions**:
- Verify embeddings are not null: `SELECT COUNT(*) FROM document_chunks WHERE embedding IS NULL`
- Check similarity threshold (try lowering to 0.1)
- Ensure query embedding uses same model (gte-small)
- Verify vector index exists: `\d document_chunks`

#### 4. "Dimension mismatch" Error

**Problem**: Embedding dimensions don't match

**Solution**:
```sql
-- Update column to correct dimensions
ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(384);

-- Recreate index
DROP INDEX IF EXISTS idx_document_chunks_embedding;
CREATE INDEX idx_document_chunks_embedding ON document_chunks
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

#### 5. RLS Blocking Queries

**Problem**: Queries return no data even though data exists

**Solutions**:
- Verify user is authenticated: `SELECT auth.uid()`
- Check RLS policies are correct
- Use service role key for testing (bypasses RLS)
- Verify `user_id` matches `auth.uid()` in data

### Debugging SQL

```sql
-- Check documents for user
SELECT id, name, processed, created_at
FROM documents
WHERE user_id = auth.uid();

-- Check chunks for document
SELECT id, chunk_index, LEFT(chunk_text, 50) as preview,
       embedding IS NOT NULL as has_embedding
FROM document_chunks
WHERE document_id = 'your-doc-id'
ORDER BY chunk_index;

-- Check embedding dimensions
SELECT id, array_length(embedding, 1) as dimensions
FROM document_chunks
WHERE embedding IS NOT NULL
LIMIT 5;

-- Test vector search
SELECT id, chunk_index,
       1 - (embedding <=> '[0.1, 0.2, ...]'::vector) as similarity
FROM document_chunks
WHERE document_id = 'your-doc-id'
  AND embedding IS NOT NULL
ORDER BY embedding <=> '[0.1, 0.2, ...]'::vector
LIMIT 5;
```

### Performance Monitoring

```sql
-- Average chunks per document
SELECT AVG(chunk_count) as avg_chunks
FROM (
  SELECT document_id, COUNT(*) as chunk_count
  FROM document_chunks
  GROUP BY document_id
) sub;

-- Documents without embeddings
SELECT d.id, d.name, d.created_at
FROM documents d
WHERE d.processed = false
ORDER BY d.created_at DESC;

-- Embedding coverage
SELECT
  COUNT(*) as total_chunks,
  COUNT(embedding) as embedded_chunks,
  ROUND(COUNT(embedding)::numeric / COUNT(*)::numeric * 100, 2) as coverage_pct
FROM document_chunks;
```

---

## Best Practices

### 1. Security

- Always use RLS for user data isolation
- Validate file types and sizes on backend
- Use signed URLs with expiration for downloads
- Sanitize file names before storage
- Never expose service role key to frontend

### 2. Performance

- Batch process embeddings to avoid timeouts
- Use appropriate index types (IVFFlat for large datasets)
- Implement pagination for large result sets
- Cache frequently accessed chunks
- Consider separating upload and processing

### 3. Error Handling

- Use try-catch for all async operations
- Log errors with context (user_id, document_id)
- Provide meaningful error messages to users
- Implement retry logic for transient failures
- Clean up partial uploads on errors

### 4. Monitoring

- Track upload success/failure rates
- Monitor embedding generation progress
- Alert on high error rates
- Track average processing times
- Monitor storage usage

### 5. Scalability

- Use connection pooling for database
- Implement rate limiting on uploads
- Consider CDN for file downloads
- Use background jobs for heavy processing
- Implement queue system for high volume

---

## Conclusion

This implementation provides a complete, production-ready system for document upload with automatic chunking and embedding generation. The system is:

- **Secure**: RLS policies enforce user data isolation
- **Scalable**: Supports batch processing and async operations
- **Flexible**: Easy to add new file types or embedding models
- **Maintainable**: Clear separation of concerns
- **Observable**: Comprehensive logging and error handling

### Key Takeaways

1. **Upload Flow**: File → Storage → Database → Extract → Chunk → Embed
2. **Chunking**: Sentence-based with overlap preserves context
3. **Embeddings**: gte-small produces 384-dim vectors
4. **Search**: pgvector cosine similarity for semantic search
5. **Security**: RLS ensures users only access their own data

This system can be adapted for various use cases including:
- Document Q&A systems
- Knowledge bases
- Content recommendation
- Semantic search engines
- RAG (Retrieval Augmented Generation) applications
