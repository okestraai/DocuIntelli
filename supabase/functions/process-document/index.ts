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

class TextExtractor {
  static async extractFromStorage(
    supabase: any,
    filePath: string,
    fileType: string
  ): Promise<string> {
    console.log(`Extracting text from: ${filePath} (${fileType})`)

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
        return await this.extractFromText(arrayBuffer)
    }
  }

  static async extractFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
    const uint8Array = new Uint8Array(arrayBuffer)
    const text = new TextDecoder().decode(uint8Array)

    const textMatches = text.match(/stream\s*(.*?)\s*endstream/gs)
    if (textMatches) {
      return textMatches
        .map(match => match.replace(/stream|endstream/g, ''))
        .join(' ')
        .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    return text
      .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 10000)
  }

  static async extractFromText(arrayBuffer: ArrayBuffer): Promise<string> {
    return new TextDecoder('utf-8').decode(arrayBuffer)
  }

  static async extractFromDOCX(arrayBuffer: ArrayBuffer): Promise<string> {
    const uint8Array = new Uint8Array(arrayBuffer)
    const text = new TextDecoder().decode(uint8Array)

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
  }
}

class TextChunker {
  private static readonly CHUNK_SIZE = 1000
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
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ success: false, error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const isServiceRole = token === serviceRoleKey

    let userId: string | null = null

    if (!isServiceRole) {
      const { data: { user }, error: userError } = await supabase.auth.getUser(token)
      if (userError || !user) {
        return new Response(
          JSON.stringify({ success: false, error: 'Invalid or expired token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      userId = user.id
    }

    const { document_id }: ProcessingRequest = await req.json()

    if (!document_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'document_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let query = supabase
      .from('documents')
      .select('id, user_id, name, processed, file_path, type')
      .eq('id', document_id)

    if (!isServiceRole && userId) {
      query = query.eq('user_id', userId)
    }

    const { data: document, error: docError } = await query.single()

    if (docError || !document) {
      return new Response(
        JSON.stringify({ success: false, error: 'Document not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (document.processed) {
      return new Response(
        JSON.stringify({
          success: true,
          data: { chunks_processed: 0, document_id: document_id, message: 'Document already processed' }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Processing document: ${document.name}`)

    let extractedText: string
    try {
      extractedText = await TextExtractor.extractFromStorage(supabase, document.file_path, document.type)
      console.log(`Extracted ${extractedText.length} characters`)
    } catch (extractError) {
      console.error('Text extraction failed:', extractError)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to extract text from document',
          details: extractError instanceof Error ? extractError.message : 'Unknown error'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!extractedText || extractedText.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No text content found in document' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const textChunks = TextChunker.chunkText(extractedText)
    console.log(`Created ${textChunks.length} chunks`)

    if (textChunks.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No valid text chunks could be created' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const documentChunks = textChunks.map((chunkText, i) => ({
      document_id: document.id,
      user_id: document.user_id,
      chunk_index: i,
      chunk_text: chunkText,
      embedding: null
    }))

    const { data: insertedChunks, error: insertError } = await supabase
      .from('document_chunks')
      .insert(documentChunks)
      .select('id')

    if (insertError) {
      console.error('Chunk insert error:', insertError)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Failed to save document chunks',
          details: insertError.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Inserted ${insertedChunks?.length || 0} chunks`)

    await supabase
      .from('documents')
      .update({ processed: true })
      .eq('id', document.id)

    console.log('Triggering embedding generation...')
    try {
      const embeddingUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-embeddings`
      fetch(embeddingUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ document_id: document.id, limit: 10 }),
      }).catch(err => console.error('Embedding trigger error:', err))
    } catch (embeddingError) {
      console.error('Error triggering embeddings:', embeddingError)
    }

    console.log('Document processing completed')

    const response: ProcessingResponse = {
      success: true,
      data: {
        chunks_processed: insertedChunks?.length || 0,
        document_id: document.id
      }
    }

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Process document error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
