import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export interface ExtractionResult {
  success: boolean;
  text?: string;
  error?: string;
}

export async function extractText(
  buffer: Buffer,
  mimetype: string
): Promise<ExtractionResult> {
  try {
    switch (mimetype) {
      case 'application/pdf':
        return await extractFromPDF(buffer);

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword':
        return await extractFromDOCX(buffer);

      case 'text/plain':
        return extractFromTXT(buffer);

      default:
        return {
          success: false,
          error: `Unsupported file type for text extraction: ${mimetype}`
        };
    }
  } catch (error: any) {
    console.error('❌ Text extraction error:', error);
    return {
      success: false,
      error: error.message || 'Failed to extract text'
    };
  }
}

async function extractFromPDF(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const data = await pdfParse(buffer);
    return {
      success: true,
      text: data.text
    };
  } catch (error: any) {
    return {
      success: false,
      error: `PDF extraction failed: ${error.message}`
    };
  }
}

async function extractFromDOCX(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return {
      success: true,
      text: result.value
    };
  } catch (error: any) {
    return {
      success: false,
      error: `DOCX extraction failed: ${error.message}`
    };
  }
}

function extractFromTXT(buffer: Buffer): ExtractionResult {
  try {
    const text = buffer.toString('utf-8');
    return {
      success: true,
      text
    };
  } catch (error: any) {
    return {
      success: false,
      error: `TXT extraction failed: ${error.message}`
    };
  }
}
