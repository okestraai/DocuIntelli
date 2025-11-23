import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ProcessingRequest {
  document_id: string
}

interface ProcessingResponse {
  success: boolean
  data?: {
    chunks_processed: number
    document_id: string
  }
  error?: string
}

// Text extraction utilities for Supabase Storage files
class TextExtractor {
  static async extractFromStorage(
    supabase: any,
    filePath: string,
    fileType: string
  ): Promise<string> {
    try {
      console.log(`📄 Extracting text from Storage file: ${filePath} (${fileType})`)

      // Download file from Supabase Storage
      const { data, error } = await supabase.storage
        .from('documents')
        .download(filePath)

      if (error) {
        throw new Error(`Failed to download file: ${error.message}`)
      }

      const arrayBuffer = await data.arrayBuffer()

      switch (fileType) {
        case 'application/pdf':
          return await this.extractFromPDF(arrayBuffer)

        case 'text/plain':
          return await this.extractFromText(arrayBuffer)

        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        case 'application/msword':
          return await this.extractFromDOCX(arrayBuffer)

        default:
          // Try text extraction as fallback
          try {
            return await this.extractFromText(arrayBuffer)
          } catch {
            throw new Error(`Unsupported file type: ${fileType}`)
          }
      }
    } catch (error) {
      console.error('❌ Text extraction error:', error)
      throw error
    }
  }

  static async extractFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
    try {
      const uint8Array = new Uint8Array(arrayBuffer)
      const text = new TextDecoder().decode(uint8Array)

      // Extract readable text between stream objects (basic approach)
      const textMatches = text.match(/stream\s*(.*?)\s*endstream/gs)
      if (textMatches) {
        return textMatches
          .map(match => match.replace(/stream|endstream/g, ''))
          .join(' ')
          .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      }

      // Fallback: extract any readable text
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

  static async extractFromText(arrayBuffer: ArrayBuffer): Promise<string> {
    try {
      return new TextDecoder('utf-8').decode(arrayBuffer)
    } catch (error) {
      console.error('Text extraction error:', error)
      throw new Error('Failed to extract text from file')
    }
  }

  static async extractFromDOCX(arrayBuffer: ArrayBuffer): Promise<string> {
    try {
      const uint8Array = new Uint8Array(arrayBuffer)
      const text = new TextDecoder().decode(uint8Array)

      // Extract text from XML content (basic approach)
      const xmlMatches = text.match(/<w:t[^>]*>(.*?)<\/w:t>/gs)
      if (xmlMatches) {
        return xmlMatches
          .map(match => match.replace(/<[^>]*>/g, ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
      }

      // Fallback
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
}

// Text chunking utility
class TextChunker {
  private static readonly CHUNK_SIZE = 800
  private static readonly OVERLAP_SIZE = 100

  static chunkText(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return []
    }

    const chunks: string[] = []
    const sentences = this.splitIntoSentences(text)

    let currentChunk = ''

    for (const sentence of sentences) {
      if (currentChunk.length + sentence.length > this.CHUNK_SIZE) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim())
        }

        const words = currentChunk.split(' ')
        const overlapWords = words.slice(-Math.floor(this.OVERLAP_SIZE / 6))
        currentChunk = overlapWords.join(' ') + ' ' + sentence
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim())
    }

    return chunks.filter(chunk => chunk.length > 50)
  }

  private static splitIntoSentences(text: string): string[] {
    const cleanText = text.replace(/\s+/g, ' ').trim()
    const sentences = cleanText.split(/(?<=[.!?])\s+(?=[A-Z])/)
    return sentences.filter(sentence => sentence.trim().length > 0)
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get user from Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization header required' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )

    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid or expired token' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Parse request body
    const { document_id }: ProcessingRequest = await req.json()

    if (!document_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'document_id is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Verify document exists and belongs to user
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('id, user_id, name, processed, file_path, type')
      .eq('id', document_id)
      .eq('user_id', user.id)
      .single()

    if (docError || !document) {
      return new Response(
        JSON.stringify({ success: false, error: 'Document not found or access denied' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Check if already processed (idempotency)
    if (document.processed) {
      console.log(`⚠️ Document already processed: ${document_id}`)
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            chunks_processed: 0,
            document_id: document_id,
            message: 'Document already processed'
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log(`📄 Processing document: ${document.name} for user: ${user.id}`)

    // Extract text from Supabase Storage file
    let extractedText: string
    try {
      extractedText = await TextExtractor.extractFromStorage(
        supabase,
        document.file_path,
        document.type
      )
      console.log(`📝 Extracted ${extractedText.length} characters of text`)
    } catch (extractError) {
      console.error('❌ Text extraction failed:', extractError)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to extract text from document',
          details: extractError instanceof Error ? extractError.message : 'Unknown error'
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (!extractedText || extractedText.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No text content found in document' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Split text into chunks
    const textChunks = TextChunker.chunkText(extractedText)
    console.log(`✂️ Created ${textChunks.length} text chunks`)

    if (textChunks.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No valid text chunks could be created' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Generate embeddings using Supabase AI
    const model = new Supabase.ai.Session('gte-small')
    const documentChunks = []

    for (let i = 0; i < textChunks.length; i++) {
      try {
        console.log(`🧠 Generating embedding for chunk ${i + 1}/${textChunks.length}`)

        const embedding = await model.run(textChunks[i], {
          mean_pool: true,
          normalize: true
        })

        documentChunks.push({
          document_id: document.id,
          user_id: user.id,
          chunk_text: textChunks[i],
          embedding: embedding
        })

        console.log(`✅ Generated embedding for chunk ${i + 1}`)
      } catch (embeddingError) {
        console.error(`❌ Embedding error for chunk ${i + 1}:`, embeddingError)
        // Continue with other chunks
      }
    }

    console.log(`🧠 Generated ${documentChunks.length} embeddings successfully`)

    // Insert chunks into database
    if (documentChunks.length > 0) {
      const { data: insertedChunks, error: insertError } = await supabase
        .from('document_chunks')
        .insert(documentChunks)
        .select('id')

      if (insertError) {
        console.error('❌ Database insert error:', insertError)
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Failed to save document chunks',
            details: insertError.message
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      console.log(`✅ Inserted ${insertedChunks?.length || 0} chunks into database`)

      // Mark document as processed
      const { error: updateError } = await supabase
        .from('documents')
        .update({ processed: true })
        .eq('id', document.id)
        .eq('user_id', user.id)

      if (updateError) {
        console.error('❌ Document update error:', updateError)
        // Don't fail the request for this, just log it
      }
    }

    console.log(`🎉 Document processing completed successfully`)
    console.log(`📊 Summary:`)
    console.log(`   - Document: ${document.name}`)
    console.log(`   - File path: ${document.file_path}`)
    console.log(`   - Text extracted: ${extractedText.length} characters`)
    console.log(`   - Chunks created: ${textChunks.length}`)
    console.log(`   - Chunks saved: ${documentChunks.length}`)

    const response: ProcessingResponse = {
      success: true,
      data: {
        chunks_processed: documentChunks.length,
        document_id: document.id
      }
    }

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('❌ Process document function error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
