import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface UploadResponse {
  success: boolean
  data?: {
    document_id: string
    files_processed: number
    total_chunks_processed: number
  }
  error?: string
}

class TextExtractor {
  static async extractFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
    try {
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
        try {
          return await this.extractFromText(arrayBuffer)
        } catch {
          throw new Error(`Unsupported file type: ${file.type}`)
        }
    }
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
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
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

    const formData = await req.formData()
    const files: File[] = []
    const name = formData.get('name') as string
    const category = formData.get('category') as string
    const expirationDate = formData.get('expirationDate') as string

    for (const [key, value] of formData.entries()) {
      if (key.startsWith('file') && value instanceof File) {
        files.push(value)
      }
    }

    if (files.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No files provided' }),
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

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'image/jpeg',
      'image/png',
      'image/gif'
    ]

    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        return new Response(
          JSON.stringify({ success: false, error: `Unsupported file type: ${file.type}` }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      if (file.size > 10 * 1024 * 1024) {
        return new Response(
          JSON.stringify({ success: false, error: 'File size exceeds 10MB limit' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }
    }

    console.log(`📄 Processing ${files.length} file(s)`)

    const getFileType = (mimeType: string): string => {
      if (mimeType.includes('pdf')) return 'PDF'
      if (mimeType.includes('word')) return 'Word'
      if (mimeType.includes('text')) return 'Text'
      if (mimeType.includes('image')) return 'Image'
      return 'Document'
    }

    const totalSize = files.reduce((sum, file) => sum + file.size, 0)
    const primaryFileType = getFileType(files[0].type)

    const { data: documentData, error: dbError } = await supabase
      .from('documents')
      .insert([{
        user_id: user.id,
        name: name.trim(),
        category: category,
        type: primaryFileType,
        size: totalSize,
        file_path: `${user.id}/${Date.now()}-multi`,
        original_name: files.length > 1 ? `${files[0].name} +${files.length - 1} more` : files[0].name,
        upload_date: new Date().toISOString().split('T')[0],
        expiration_date: expirationDate || null,
        status: 'active',
        processed: false
      }])
      .select()
      .single()

    if (dbError) {
      console.error('❌ Database insert error:', dbError)
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

    let totalChunksProcessed = 0
    const uploadedFilePaths: string[] = []

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex]
      const timestamp = Date.now()
      const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_')
      const uniquePath = `${user.id}/${timestamp}-${fileIndex}-${sanitizedName}`

      try {
        console.log(`☁️ [${fileIndex + 1}/${files.length}] Uploading: ${file.name}`)
        const fileBuffer = await file.arrayBuffer()
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('documents')
          .upload(uniquePath, fileBuffer, {
            contentType: file.type,
            upsert: false
          })

        if (uploadError) {
          console.error(`❌ Storage upload error for file ${fileIndex + 1}:`, uploadError)
          continue
        }

        uploadedFilePaths.push(uniquePath)
        console.log(`✅ File uploaded: ${uploadData.path}`)

        const { data: fileRecord, error: fileError } = await supabase
          .from('document_files')
          .insert([{
            document_id: documentData.id,
            file_path: uniquePath,
            original_name: file.name,
            file_order: fileIndex + 1,
            size: file.size,
            type: file.type,
            processed: false
          }])
          .select()
          .single()

        if (fileError) {
          console.error(`❌ File record insert error:`, fileError)
          continue
        }

        console.log(`✅ File record created: ${fileRecord.id}`)

        try {
          console.log(`📝 Extracting text from file ${fileIndex + 1}`)
          const extractedText = await TextExtractor.extractText(file)

          if (extractedText && extractedText.trim().length > 0) {
            console.log(`📄 Extracted ${extractedText.length} characters`)

            const textChunks = TextChunker.chunkText(extractedText)
            console.log(`✂️ Created ${textChunks.length} chunks`)

            if (textChunks.length > 0) {
              console.log(`💾 Storing ${textChunks.length} text chunks`)

              const documentChunks = []

              for (let i = 0; i < textChunks.length; i++) {
                try {
                  documentChunks.push({
                    document_id: documentData.id,
                    file_id: fileRecord.id,
                    user_id: user.id,
                    chunk_index: i,
                    chunk_text: textChunks[i],
                    embedding: null
                  })

                  console.log(`✅ Chunk ${i + 1}/${textChunks.length} prepared`)
                } catch (chunkError) {
                  console.error(`❌ Chunk preparation error for chunk ${i + 1}:`, chunkError)
                }
              }

              if (documentChunks.length > 0) {
                const { data: insertedChunks, error: insertError } = await supabase
                  .from('document_chunks')
                  .insert(documentChunks)
                  .select('id')

                if (insertError) {
                  console.error('❌ Chunk insert error:', insertError)
                } else {
                  const chunksCount = insertedChunks?.length || 0
                  totalChunksProcessed += chunksCount
                  console.log(`✅ Inserted ${chunksCount} chunks for file ${fileIndex + 1}`)

                  await supabase
                    .from('document_files')
                    .update({ processed: true })
                    .eq('id', fileRecord.id)
                }
              }
            }
          }
        } catch (textError) {
          console.error(`❌ Text processing error for file ${fileIndex + 1}:`, textError)
        }
      } catch (fileError) {
        console.error(`❌ Error processing file ${fileIndex + 1}:`, fileError)
      }
    }

    if (uploadedFilePaths.length > 0) {
      await supabase
        .from('documents')
        .update({ processed: true })
        .eq('id', documentData.id)
    }

    if (totalChunksProcessed > 0) {
      console.log(`🧠 Triggering embedding generation for ${totalChunksProcessed} chunks...`)

      try {
        const embeddingUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-embeddings`
        const embeddingResponse = await fetch(embeddingUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            document_id: documentData.id,
            limit: 1
          })
        })

        if (embeddingResponse.ok) {
          const embeddingResult = await embeddingResponse.json()
          console.log(`✅ Embedding generation triggered: ${embeddingResult.updated || 0} embeddings created`)
        } else {
          console.error('⚠️ Embedding generation request failed:', embeddingResponse.status)
        }
      } catch (embeddingError) {
        console.error('⚠️ Failed to trigger embedding generation:', embeddingError)
      }
    }

    console.log(`🎉 Upload workflow completed`)
    console.log(`📊 Summary:`)
    console.log(`   - Document ID: ${documentData.id}`)
    console.log(`   - Files processed: ${uploadedFilePaths.length}/${files.length}`)
    console.log(`   - Total chunks: ${totalChunksProcessed}`)

    const response: UploadResponse = {
      success: true,
      data: {
        document_id: documentData.id,
        files_processed: uploadedFilePaths.length,
        total_chunks_processed: totalChunksProcessed
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
