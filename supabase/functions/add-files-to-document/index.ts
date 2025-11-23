import { createClient } from 'npm:@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface AddFilesResponse {
  success: boolean
  data?: {
    files_added: number
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

    console.log(`📤 Add files request from user: ${user.id}`)

    const formData = await req.formData()
    const files: File[] = []
    const documentId = formData.get('documentId') as string
    const updateExpiration = formData.get('updateExpiration') as string
    const newExpirationDate = formData.get('expirationDate') as string

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

    if (!documentId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Document ID is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (docError || !document) {
      return new Response(
        JSON.stringify({ success: false, error: 'Document not found or access denied' }),
        {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log(`📄 Adding ${files.length} file(s) to document: ${documentId}`)

    if (updateExpiration === 'true' && newExpirationDate) {
      await supabase
        .from('documents')
        .update({ expiration_date: newExpirationDate })
        .eq('id', documentId)
        .eq('user_id', user.id)

      console.log(`📅 Updated document expiration date to: ${newExpirationDate}`)
    }

    const { data: existingFiles } = await supabase
      .from('document_files')
      .select('file_order')
      .eq('document_id', documentId)
      .order('file_order', { ascending: false })
      .limit(1)

    const startingOrder = existingFiles && existingFiles.length > 0
      ? existingFiles[0].file_order + 1
      : 1

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

    let totalChunksProcessed = 0
    const uploadedFilePaths: string[] = []
    const model = new Supabase.ai.Session('gte-small')

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
            document_id: documentId,
            file_path: uniquePath,
            original_name: file.name,
            file_order: startingOrder + fileIndex,
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
              console.log(`🧠 Generating embeddings for ${textChunks.length} chunks`)

              const documentChunks = []

              for (let i = 0; i < textChunks.length; i++) {
                try {
                  const embedding = await model.run(textChunks[i], {
                    mean_pool: true,
                    normalize: true
                  })

                  documentChunks.push({
                    document_id: documentId,
                    file_id: fileRecord.id,
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

    console.log(`🎉 Add files workflow completed`)
    console.log(`📊 Summary:`)
    console.log(`   - Document ID: ${documentId}`)
    console.log(`   - Files added: ${uploadedFilePaths.length}/${files.length}`)
    console.log(`   - Total chunks: ${totalChunksProcessed}`)

    const response: AddFilesResponse = {
      success: true,
      data: {
        files_added: uploadedFilePaths.length,
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
    console.error('❌ Add files function error:', error)
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
