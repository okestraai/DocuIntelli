# Document Viewer Implementation Guide

## Overview

This guide details the implementation of a document viewer system that can display PDF files directly in the browser and convert Microsoft Word documents (.docx, .doc) to HTML for browser viewing. The system is built using React with TypeScript on the frontend and Supabase Edge Functions for backend processing.

## Architecture

### High-Level Flow

1. **PDF Documents**: Fetched from Supabase Storage → Converted to Blob URL → Displayed using `<embed>` tag
2. **Word Documents**: Fetched from Supabase Storage → Sent to Edge Function → Converted to HTML using Mammoth → Displayed in `<iframe>`
3. **Other Files**: Images, text files, and unsupported formats handled accordingly

### Technology Stack

- **Frontend**: React 18+ with TypeScript
- **Backend**: Supabase Edge Functions (Deno runtime)
- **Storage**: Supabase Storage
- **Word Conversion**: Mammoth.js (npm:mammoth@1.8.0)
- **Authentication**: Supabase Auth

---

## Part 1: Frontend Implementation

### Component Structure

The main component is `DocumentViewer.tsx` which handles:
- Document loading from Supabase Storage
- File type detection
- Word document conversion
- Rendering appropriate viewer for each file type

### Key State Variables

```typescript
const [documentUrl, setDocumentUrl] = useState<string | null>(null);     // Signed URL from Supabase
const [blobUrl, setBlobUrl] = useState<string | null>(null);             // Local blob URL for rendering
const [isLoading, setIsLoading] = useState(true);                        // Loading state
const [error, setError] = useState<string | null>(null);                 // Error state
const [isConverting, setIsConverting] = useState(false);                 // Word doc conversion state
const [isConvertedDoc, setIsConvertedDoc] = useState(false);             // Flag for converted docs
```

### Core Logic: Document Loading

```typescript
const loadDocument = useCallback(async () => {
  try {
    setIsLoading(true);
    setError(null);

    // Step 1: Get file path from database
    // Check if multi-file or single file document
    const { data: files, error: filesError } = await supabase
      .from('document_files')
      .select('file_path')
      .eq('document_id', document.id)
      .order('file_order', { ascending: true })
      .limit(1);

    let filePath: string;

    if (files && files.length > 0) {
      // Multi-file document - use first file
      filePath = files[0].file_path;
    } else {
      // Single file document - get from documents table
      const { data: docData, error: docError } = await supabase
        .from('documents')
        .select('file_path')
        .eq('id', document.id)
        .single();

      if (docError || !docData?.file_path) {
        throw new Error('Failed to get document file path');
      }

      filePath = docData.file_path;
    }

    // Step 2: Create signed URL for secure access
    const { data: signedUrlData, error: signedUrlError } = await supabase
      .storage
      .from('documents')
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    let fetchUrl: string;

    if (signedUrlError || !signedUrlData) {
      // Fallback to public URL if signed URL fails
      const { data: publicUrlData } = supabase
        .storage
        .from('documents')
        .getPublicUrl(filePath);

      fetchUrl = publicUrlData.publicUrl;
    } else {
      fetchUrl = signedUrlData.signedUrl;
    }

    setDocumentUrl(fetchUrl);

    // Step 3: Check if Word document that needs conversion
    const isWordDoc = document.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                      document.type === 'application/msword' ||
                      document.name.toLowerCase().endsWith('.docx') ||
                      document.name.toLowerCase().endsWith('.doc');

    if (isWordDoc) {
      // Convert Word document to HTML
      await convertWordDocument(filePath);
    } else {
      // For other files, fetch as blob and create object URL
      const response = await fetch(fetchUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch document: ${response.status}`);
      }

      const blob = await response.blob();
      const objectURL = URL.createObjectURL(blob);
      setBlobUrl(objectURL);
    }

  } catch (err) {
    console.error('Error loading document:', err);
    setError(err instanceof Error ? err.message : 'Failed to load document');
  } finally {
    setIsLoading(false);
  }
}, [document]);
```

### Word Document Conversion

```typescript
const convertWordDocument = async (filePath: string) => {
  setIsConverting(true);

  try {
    // Get authentication token
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      throw new Error('Not authenticated');
    }

    // Call Edge Function for conversion
    const conversionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/convert-to-pdf`;

    const conversionResponse = await fetch(conversionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ filePath }),
    });

    if (!conversionResponse.ok) {
      const errorData = await conversionResponse.json().catch(() => ({}));
      throw new Error(errorData.error || 'Failed to convert document');
    }

    // Get HTML content from response
    const htmlContent = await conversionResponse.text();

    // Create blob URL from HTML
    const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
    const objectURL = URL.createObjectURL(htmlBlob);

    setBlobUrl(objectURL);
    setIsConvertedDoc(true);  // Mark as converted for correct rendering

  } catch (conversionError) {
    console.error('Conversion error:', conversionError);
    throw new Error(conversionError instanceof Error ? conversionError.message : 'Failed to convert document');
  } finally {
    setIsConverting(false);
  }
};
```

### File Type Detection Helpers

```typescript
const isPDFFile = () => {
  const mimeType = document.type?.toLowerCase() || '';
  const fileName = document.name.toLowerCase();
  return mimeType === 'application/pdf' || fileName.endsWith('.pdf');
};

const isWordFile = () => {
  const mimeType = document.type?.toLowerCase() || '';
  const fileName = document.name.toLowerCase();
  return mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
         mimeType === 'application/msword' ||
         fileName.match(/\.(doc|docx)$/);
};

const isImageFile = () => {
  const mimeType = document.type?.toLowerCase() || '';
  const fileName = document.name.toLowerCase();
  return mimeType.startsWith('image/') ||
         fileName.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|tiff)$/);
};

const isTextFile = () => {
  const mimeType = document.type?.toLowerCase() || '';
  const fileName = document.name.toLowerCase();
  return mimeType === 'text/plain' || fileName.endsWith('.txt');
};
```

### Rendering Logic

The component uses conditional rendering based on file type:

```typescript
{blobUrl && !isLoading && !error && (
  <div className="h-full">
    {/* PDF Rendering */}
    {isPDFFile() && (
      <div className="h-full flex flex-col">
        <div className="flex-1 overflow-auto">
          <embed
            src={blobUrl}
            type="application/pdf"
            className="w-full h-full"
            title={document.name}
          />
        </div>
        <div className="p-2 bg-gray-50 border-t text-center text-xs text-gray-600">
          PDF loaded successfully • <button onClick={handleDownload} className="text-blue-600 hover:underline">Download</button>
        </div>
      </div>
    )}

    {/* Image Rendering */}
    {isImageFile() && (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center p-8 overflow-auto bg-gray-50">
          <img
            src={blobUrl}
            alt={document.name}
            className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
          />
        </div>
      </div>
    )}

    {/* Converted Word Document Rendering */}
    {isConvertedDoc && (
      <div className="h-full flex flex-col">
        <div className="flex-1 overflow-auto">
          <iframe
            src={blobUrl}
            className="w-full h-full border-0"
            title={document.name}
            sandbox="allow-same-origin"
          />
        </div>
        <div className="p-2 bg-gray-50 border-t text-center text-xs text-gray-600">
          Document converted and displayed • <button onClick={handleDownload} className="text-blue-600 hover:underline">Download original</button>
        </div>
      </div>
    )}

    {/* Fallback for Office Files that couldn't be converted */}
    {isOfficeFile() && !isConvertedDoc && (
      <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-md">
          <p className="text-sm text-gray-500 mb-6">
            Office documents cannot be previewed directly in the browser.
          </p>
          <button
            onClick={handleDownload}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg"
          >
            Download Document
          </button>
        </div>
      </div>
    )}

    {/* Text File Rendering */}
    {isTextFile() && (
      <iframe
        src={blobUrl}
        className="w-full h-full border-0 bg-white p-4"
        title={document.name}
      />
    )}
  </div>
)}
```

### Memory Management

Important: Clean up blob URLs to prevent memory leaks:

```typescript
useEffect(() => {
  return () => {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
  };
}, [blobUrl]);
```

### Download Functionality

```typescript
const handleDownload = async () => {
  if (!blobUrl && !documentUrl) {
    return;
  }

  try {
    // Use blob URL if available, otherwise fetch from signed URL
    let downloadUrl = blobUrl;

    if (!downloadUrl && documentUrl) {
      const response = await fetch(documentUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch document for download');
      }
      const blob = await response.blob();
      downloadUrl = URL.createObjectURL(blob);
    }

    if (!downloadUrl) {
      throw new Error('No download URL available');
    }

    // Create download link
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = document.name;
    link.style.display = 'none';

    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Clean up temporary URL
    if (downloadUrl !== blobUrl) {
      URL.revokeObjectURL(downloadUrl);
    }

  } catch (error) {
    console.error('Download error:', error);
  }
};
```

---

## Part 2: Backend Implementation (Edge Function)

### Edge Function: convert-to-pdf

**Location**: `supabase/functions/convert-to-pdf/index.ts`

This Edge Function converts Word documents to HTML using the Mammoth.js library.

### Complete Edge Function Code

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Parse request body
    const { filePath } = await req.json();

    if (!filePath) {
      return new Response(
        JSON.stringify({ error: "File path is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Converting document to HTML:", filePath);

    // Initialize Supabase client with service role key
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Download the file from Supabase Storage
    const { data: fileData, error: downloadError } = await supabase
      .storage
      .from('documents')
      .download(filePath);

    if (downloadError || !fileData) {
      console.error('Error downloading file:', downloadError);
      return new Response(
        JSON.stringify({ error: "Failed to download file from storage" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log('File downloaded, size:', fileData.size);

    // Import mammoth library from npm
    const mammoth = await import('npm:mammoth@1.8.0');

    // Convert Blob to ArrayBuffer then to Uint8Array
    // Mammoth expects a buffer, not an arrayBuffer
    const arrayBuffer = await fileData.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    console.log('Buffer created, length:', buffer.length);

    // Convert DOCX to HTML using mammoth
    const result = await mammoth.convertToHtml({ buffer });
    const html = result.value;
    const messages = result.messages;

    // Log any conversion warnings or messages
    if (messages.length > 0) {
      console.log('Conversion messages:', messages);
    }

    console.log('Converted to HTML, length:', html.length);

    // Create complete HTML document with styling
    const styledHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body {
      font-family: 'Calibri', 'Arial', sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      color: #333;
    }
    p {
      margin: 12px 0;
    }
    h1, h2, h3, h4, h5, h6 {
      margin-top: 24px;
      margin-bottom: 16px;
      font-weight: bold;
    }
    h1 { font-size: 2em; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.17em; }
    ul, ol {
      margin: 12px 0;
      padding-left: 40px;
    }
    li {
      margin: 6px 0;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin: 12px 0;
    }
    td, th {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    th {
      background-color: #f2f2f2;
      font-weight: bold;
    }
    img {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
${html}
</body>
</html>
`;

    // Return HTML with proper headers
    return new Response(styledHtml, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "text/html",
      },
    });

  } catch (error) {
    console.error("Error in convert-to-pdf:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error occurred"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
```

### Key Implementation Details

#### 1. Mammoth Library Usage

The critical detail is that Mammoth expects a `buffer` property with a Uint8Array:

```typescript
// CORRECT ✓
const arrayBuffer = await fileData.arrayBuffer();
const buffer = new Uint8Array(arrayBuffer);
const result = await mammoth.convertToHtml({ buffer });

// INCORRECT ✗
const arrayBuffer = await fileData.arrayBuffer();
const result = await mammoth.convertToHtml({ arrayBuffer }); // Will fail!
```

#### 2. CORS Headers

Always include comprehensive CORS headers:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};
```

The `X-Client-Info` and `Apikey` headers are critical for Supabase client compatibility.

#### 3. Environment Variables

These are automatically available in Supabase Edge Functions:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `SUPABASE_DB_URL`

#### 4. HTML Styling

The returned HTML includes embedded CSS to make the document readable and well-formatted. Adjust styles to match your application's design.

---

## Part 3: Deployment and Setup

### Prerequisites

1. Supabase project with Storage bucket named `documents`
2. Supabase Auth configured
3. Node.js and npm installed
4. Supabase CLI (optional, but recommended)

### Environment Variables

Create a `.env` file:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Database Schema (if needed)

```sql
-- Documents table
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  type TEXT,
  size TEXT,
  category TEXT,
  file_path TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Multi-file support (optional)
CREATE TABLE document_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_files ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own documents"
  ON documents FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view own document files"
  ON document_files FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_files.document_id
      AND documents.user_id = auth.uid()
    )
  );
```

### Storage Bucket Configuration

1. Create a bucket named `documents` in Supabase Storage
2. Set appropriate policies:

```sql
-- Allow authenticated users to upload
CREATE POLICY "Users can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to read own documents
CREATE POLICY "Users can read own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  auth.uid()::text = (storage.foldername(name))[1]
);
```

### Deploying the Edge Function

If using Supabase MCP tools:

```typescript
// Use the mcp__supabase__deploy_edge_function tool
// with the complete code from Part 2
```

If using Supabase CLI:

```bash
supabase functions deploy convert-to-pdf
```

---

## Part 4: Supported File Types

### PDF Files
- **MIME Types**: `application/pdf`
- **Rendering Method**: `<embed>` tag with PDF blob URL
- **Browser Support**: All modern browsers

### Word Documents
- **MIME Types**:
  - `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (.docx)
  - `application/msword` (.doc)
- **Rendering Method**: Converted to HTML via Mammoth, displayed in `<iframe>`
- **Limitations**: Complex formatting may not be perfectly preserved

### Images
- **MIME Types**: `image/*`
- **Extensions**: `.jpg`, `.jpeg`, `.png`, `.gif`, `.webp`, `.bmp`, `.svg`, `.tiff`
- **Rendering Method**: `<img>` tag with blob URL

### Text Files
- **MIME Types**: `text/plain`
- **Extensions**: `.txt`
- **Rendering Method**: `<iframe>` with blob URL

### Unsupported Files
- Excel (.xlsx, .xls)
- PowerPoint (.pptx, .ppt)
- Other file types

These show a download button instead of preview.

---

## Part 5: Troubleshooting

### Common Issues

#### 1. "Could not find file in options" Error

**Problem**: Mammoth receives incorrect data format

**Solution**: Ensure you're passing a Uint8Array as `buffer`, not an ArrayBuffer:

```typescript
const buffer = new Uint8Array(arrayBuffer);
const result = await mammoth.convertToHtml({ buffer }); // Correct
```

#### 2. CORS Errors

**Problem**: Missing or incorrect CORS headers

**Solution**: Ensure all headers are included, especially:
- `Access-Control-Allow-Headers: Content-Type, Authorization, X-Client-Info, Apikey`

#### 3. Word Document Shows Download Message Instead of Converting

**Problem**: `isConvertedDoc` flag not set or conditional rendering wrong

**Solution**:
- Ensure `setIsConvertedDoc(true)` is called after successful conversion
- Check conditional rendering order (converted docs should render before generic Office file check)

#### 4. PDF Not Displaying

**Problem**: Blob URL not created or embed tag not rendering

**Solution**:
- Check browser console for errors
- Verify blob URL is created: `URL.createObjectURL(blob)`
- Ensure `type="application/pdf"` is set on embed tag

#### 5. Memory Leaks

**Problem**: Blob URLs not cleaned up

**Solution**: Always revoke object URLs in cleanup:

```typescript
useEffect(() => {
  return () => {
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
  };
}, [blobUrl]);
```

---

## Part 6: Testing Checklist

- [ ] PDF file loads and displays correctly
- [ ] PDF can be downloaded
- [ ] Word (.docx) file converts to HTML
- [ ] Converted Word document displays properly
- [ ] Word document can be downloaded (original file)
- [ ] Images load and display
- [ ] Text files load and display
- [ ] Error handling works (try invalid file path)
- [ ] Loading states display correctly
- [ ] Memory cleanup works (check DevTools Memory profiler)
- [ ] Authentication is required to access documents
- [ ] Users can only view their own documents

---

## Part 7: Performance Optimization

### Frontend Optimizations

1. **Lazy Loading**: Only load documents when viewer opens
2. **Caching**: Consider caching signed URLs (respect expiry)
3. **Debouncing**: If multiple documents can be selected rapidly

### Backend Optimizations

1. **Caching Converted Documents**: Store converted HTML in database or cache
2. **Streaming**: For very large files, consider streaming responses
3. **Compression**: Enable gzip compression for HTML responses

### Example: Caching Converted Documents

```typescript
// Check if conversion already exists in database
const { data: cachedHtml } = await supabase
  .from('converted_documents')
  .select('html_content')
  .eq('document_id', documentId)
  .maybeSingle();

if (cachedHtml) {
  return new Response(cachedHtml.html_content, {
    status: 200,
    headers: {
      ...corsHeaders,
      "Content-Type": "text/html",
    },
  });
}

// Otherwise, convert and cache...
```

---

## Part 8: Security Considerations

### 1. Authentication

Always verify authentication before allowing document access:

```typescript
const { data: { session } } = await supabase.auth.getSession();
if (!session) {
  throw new Error('Not authenticated');
}
```

### 2. Row Level Security

Enable RLS on all tables and buckets to ensure users can only access their own documents.

### 3. Signed URLs

Use signed URLs with expiration for temporary access:

```typescript
const { data: signedUrlData } = await supabase
  .storage
  .from('documents')
  .createSignedUrl(filePath, 3600); // 1 hour
```

### 4. Input Validation

Validate file paths and prevent path traversal:

```typescript
if (!filePath || filePath.includes('..')) {
  throw new Error('Invalid file path');
}
```

### 5. Content Security Policy

Consider setting CSP headers for iframe rendering:

```typescript
sandbox="allow-same-origin"  // Restrict iframe capabilities
```

---

## Conclusion

This implementation provides a robust document viewing system with:
- Direct PDF viewing in browser
- Word document to HTML conversion
- Secure document access via Supabase Auth and Storage
- Clean memory management
- Error handling and user feedback

The system can be easily extended to support additional file types by adding new conversion Edge Functions and corresponding frontend handlers.

### Key Takeaways

1. **PDF**: Direct embedding works great with blob URLs
2. **Word**: Server-side conversion with Mammoth is reliable
3. **Security**: Always use RLS and signed URLs
4. **Memory**: Clean up blob URLs to prevent leaks
5. **UX**: Provide loading states and error messages

This implementation is production-ready and can handle typical document viewing needs in web applications.
