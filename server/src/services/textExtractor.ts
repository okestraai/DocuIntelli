import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export interface ExtractionResult {
  text: string;
  chunks: Array<{ index: number; content: string }>;
}

export class TextExtractor {
  static async extractText(buffer: Buffer, mimeType: string): Promise<string> {
    switch (mimeType) {
      case 'application/pdf':
        return await this.extractFromPDF(buffer);

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword':
        return await this.extractFromDOCX(buffer);

      case 'text/plain':
        return buffer.toString('utf-8');

      default:
        try {
          return buffer.toString('utf-8');
        } catch {
          throw new Error(`Unsupported file type: ${mimeType}`);
        }
    }
  }

  static async extractFromPDF(buffer: Buffer): Promise<string> {
    try {
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      console.error('PDF extraction error:', error);
      throw new Error('Failed to extract text from PDF');
    }
  }

  static async extractFromDOCX(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      console.error('DOCX extraction error:', error);
      throw new Error('Failed to extract text from DOCX');
    }
  }

  static chunkText(text: string, chunkSize: number = 1000, overlap: number = 100): Array<{ index: number; content: string }> {
    const chunks: Array<{ index: number; content: string }> = [];
    let start = 0;
    let index = 0;

    while (start < text.length) {
      const end = start + chunkSize;
      const chunk = text.slice(start, end).trim();

      if (chunk.length > 0) {
        chunks.push({
          index,
          content: chunk,
        });
      }

      start = end - overlap;
      index++;
    }

    return chunks;
  }

  static async extractAndChunk(buffer: Buffer, mimeType: string): Promise<ExtractionResult> {
    const text = await this.extractText(buffer, mimeType);
    const chunks = this.chunkText(text);

    return {
      text,
      chunks,
    };
  }
}
