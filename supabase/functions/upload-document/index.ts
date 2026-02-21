import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get("ALLOWED_ORIGIN") || "http://localhost:5173",
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface UploadResponse {
  success: boolean
  data?: {
    document_id: string
    file_path: string
    public_url: string
    chunks_processed: number
    file_type: string
  }
  error?: string
}

// Text extraction utilities
class TextExtractor {
  static async extractFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
    try {
      const uint8Array = new Uint8Array(arrayBuffer)
      const text = new TextDecoder('latin1').decode(uint8Array)
      
      // Try to extract text content from PDF
      // Look for text between BT (Begin Text) and ET (End Text) operators
      const textObjects: string[] = []
      const btPattern = /BT\s+([\s\S]*?)\s+ET/g
      let match
      
      while ((match = btPattern.exec(text)) !== null) {
        const textBlock = match[1]
        // Extract strings from Tj and TJ operators
        const tjPattern = /\(([^)]+)\)/g
        let tjMatch
        while ((tjMatch = tjPattern.exec(textBlock)) !== null) {
          textObjects.push(tjMatch[1])
        }
        
        // Extract hex strings
        const hexPattern = /<([0-9A-Fa-f]+)>/g
        let hexMatch
        while ((hexMatch = hexPattern.exec(textBlock)) !== null) {
          try {
            const hexStr = hexMatch[1]
            const bytes = hexStr.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
            const decoded = new TextDecoder('latin1').decode(new Uint8Array(bytes))
            textObjects.push(decoded)
          } catch {}
        }
      }
      
      if (textObjects.length > 0) {
        const extracted = textObjects.join(' ')
          .replace(/\\n/g, ' ')
          .replace(/\\r/g, ' ')
          .replace(/\\t/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        
        if (extracted.length > 50) {
          console.log(`✅ Extracted ${extracted.length} chars from PDF using BT/ET parsing`)
          return extracted
        }
      }
      
      // Fallback: try to extract any readable ASCII text
      console.log('⚠️ BT/ET parsing found little text, trying fallback method')
      const readable = text
        .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      
      if (readable.length > 100) {
        console.log(`✅ Extracted ${readable.length} chars using fallback method`)
        return readable.slice(0, 10000)
      }
      
      throw new Error('Could not extract sufficient text from PDF')
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

  static async extractText(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer()
    
    console.log(`🔍 Attempting extraction for ${file.type}, size: ${arrayBuffer.byteLength} bytes`)
    
    switch (file.type) {
      case 'application/pdf':
        return await this.extractFromPDF(arrayBuffer)
      
      case 'text/plain':
        return await this.extractFromText(arrayBuffer)
      
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await this.extractFromDOCX(arrayBuffer)
      
      default:
        // For unsupported types, try text extraction as fallback
        try {
          return await this.extractFromText(arrayBuffer)
        } catch {
          throw new Error(`Unsupported file type: ${file.type}`)
        }
    }
  }
}

// Text chunking utility
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

    // Initialize Supabase client with service role for storage operations
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

    console.log(`📤 Upload request from user: ${user.id}`)

    // Parse multipart form data
    const formData = await req.formData()
    const file = formData.get('file') as File
    const name = formData.get('name') as string
    const category = formData.get('category') as string
    const expirationDate = formData.get('expirationDate') as string

    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: 'No file provided' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    if (!name || !category) {
      return new Response(
        JSON.stringify({ success: false, error: 'Name and category are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
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
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      return new Response(
        JSON.stringify({ success: false, error: 'File size exceeds 10MB limit' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`📄 Processing file: ${file.name} (${file.type}, ${file.size} bytes)`)

    // Generate unique file path
    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
    const uniquePath = `${user.id}/${timestamp}-${sanitizedName}`

    // Helper functions
    const formatFileSize = (bytes: number): string => {
      if (bytes === 0) return '0 Bytes'
      const k = 1024
      const sizes = ['Bytes', 'KB', 'MB', 'GB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
    }

    const getFileType = (mimeType: string): string => {
      if (mimeType.includes('pdf')) return 'PDF'
      if (mimeType.includes('word')) return 'Word'
      if (mimeType.includes('text')) return 'Text'
      if (mimeType.includes('image')) return 'Image'
      return 'Document'
    }

    // Step 1: Upload file to storage
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
        JSON.stringify({ 
          success: false, 
          error: 'Failed to upload file to storage',
          details: uploadError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`✅ File uploaded to storage: ${uploadData.path}`)

    // Step 2: Create document record in database
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
      console.error('❌ Database insert error:', dbError)
      
      // Clean up uploaded file if database insert fails
      await supabase.storage
        .from('documents')
        .remove([uniquePath])

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to create document record',
          details: dbError.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`✅ Document record created: ${documentData.id}`)

    // Step 3: Extract text content and create chunks
    let chunksProcessed = 0
    try {
      console.log(`📝 Extracting text from ${file.type} file`)
      const extractedText = await TextExtractor.extractText(file)

      if (extractedText && extractedText.trim().length > 0) {
        console.log(`📄 Extracted ${extractedText.length} characters of text`)

        // Step 4: Split into chunks
        const textChunks = TextChunker.chunkText(extractedText)
        console.log(`✂️ Created ${textChunks.length} text chunks`)

        if (textChunks.length > 0) {
          // Step 5: Insert chunks into database with NULL embeddings
          console.log(`💾 Inserting ${textChunks.length} chunks with NULL embeddings`)

          const documentChunks = textChunks.map((chunkText, i) => ({
            document_id: documentData.id,
            user_id: user.id,
            chunk_index: i,
            chunk_text: chunkText,
            embedding: null
          }))

          const { data: insertedChunks, error: insertError } = await supabase
            .from('document_chunks')
            .insert(documentChunks)
            .select('id')

          if (insertError) {
            console.error('❌ Chunk insert error:', insertError)
          } else {
            chunksProcessed = insertedChunks?.length || 0
            console.log(`✅ Inserted ${chunksProcessed} chunks into database`)

            // Mark document as processed
            await supabase
              .from('documents')
              .update({ processed: true })
              .eq('id', documentData.id)
              .eq('user_id', user.id)

            // Trigger embedding generation directly
            console.log(`🔄 Triggering embedding generation...`)
            try {
              const embeddingUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-embeddings`
              const embeddingResponse = await fetch(embeddingUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  document_id: documentData.id,
                  limit: 10
                }),
              })

              if (embeddingResponse.ok) {
                const embeddingResult = await embeddingResponse.json()
                console.log(`✅ Embedding generation triggered: ${embeddingResult.updated} chunks updated`)
              } else {
                console.error('⚠️ Embedding generation request failed:', embeddingResponse.status)
              }
            } catch (embeddingError) {
              console.error('⚠️ Failed to trigger embedding generation:', embeddingError)
            }
          }
        }
      } else {
        console.log(`⚠️ No text extracted from file: ${file.name}`)
      }
    } catch (textError) {
      console.error('❌ Text processing error (non-blocking):', textError)
      // Don't fail the upload if text processing fails
    }

    // Get public URL for the uploaded file
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(uniquePath)

    console.log(`🎉 Upload workflow completed successfully`)
    console.log(`📊 Summary:`)
    console.log(`   - File: ${file.name} (${getFileType(file.type)})`)
    console.log(`   - Storage path: ${uniquePath}`)
    console.log(`   - Document ID: ${documentData.id}`)
    console.log(`   - Chunks processed: ${chunksProcessed}`)

    const response: UploadResponse = {
      success: true,
      data: {
        document_id: documentData.id,
        file_path: uniquePath,
        public_url: urlData.publicUrl,
        chunks_processed: chunksProcessed,
        file_type: getFileType(file.type)
      }
    }

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('❌ Upload function error:', error)
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