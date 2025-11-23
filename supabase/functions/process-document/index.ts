import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ProcessingRequest {
  document_id: string
  text_content?: string
}

interface ProcessingResponse {
  success: boolean
  data?: {
    chunks_processed: number
    document_id: string
  }
  error?: string
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
    const { document_id, text_content }: ProcessingRequest = await req.json()

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
      .select('id, user_id, name')
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

    console.log(`📄 Processing document: ${document.name} for user: ${user.id}`)

    // If text_content is provided, use it; otherwise extract from file
    let extractedText = text_content
    
    if (!extractedText) {
      // For now, return an error asking for text content
      // In a full implementation, you'd extract text from the file here
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Text extraction not implemented yet. Please provide text_content in request body.' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!extractedText || extractedText.trim().length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No text content to process' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`📝 Extracted ${extractedText.length} characters of text`)

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
    const embeddings: number[][] = []

    for (const chunk of textChunks) {
      try {
        const embedding = await model.run(chunk, { 
          mean_pool: true, 
          normalize: true 
        })
        embeddings.push(embedding)
      } catch (embeddingError) {
        console.error('❌ Embedding generation error:', embeddingError)
        // Continue with other chunks, but log the error
      }
    }

    console.log(`🧠 Generated ${embeddings.length} embeddings`)

    // Prepare document chunks for database
    const documentChunks = textChunks.map((chunk, index) => ({
      document_id: document.id,
      user_id: user.id,
      chunk_text: chunk,
      embedding: embeddings[index] || null
    }))

    // Insert chunks into database
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

    console.log(`✅ Successfully processed document with ${documentChunks.length} chunks`)

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