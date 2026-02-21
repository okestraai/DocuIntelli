import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';
import { execSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

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

      case 'image/jpeg':
      case 'image/jpg':
      case 'image/png':
      case 'image/gif':
      case 'image/webp':
      case 'image/bmp':
      case 'image/tiff':
        return await this.extractFromImage(buffer);

      default:
        try {
          return buffer.toString('utf-8');
        } catch {
          throw new Error(`Unsupported file type: ${mimeType}`);
        }
    }
  }

  static async extractFromPDF(buffer: Buffer): Promise<string> {
    // Attempt 1: pdf-parse (structured extraction)
    try {
      const data = await pdfParse(buffer);
      if (data.text && data.text.trim().length > 50) {
        console.log(`📄 pdf-parse extracted ${data.text.length} characters`);
        return data.text;
      }
      console.warn('⚠️ pdf-parse returned insufficient text, trying binary extraction...');
    } catch (error) {
      console.warn('⚠️ pdf-parse failed, trying binary extraction...', error);
    }

    // Attempt 2: Raw binary stream extraction (same approach as edge function)
    return this.extractFromPDFBinary(buffer);
  }

  /**
   * Fallback PDF extraction: parse raw binary for stream/endstream objects.
   * This mirrors the edge function approach and handles PDFs that pdf-parse cannot.
   */
  static extractFromPDFBinary(buffer: Buffer): string {
    const raw = buffer.toString('latin1');

    // Extract text from PDF stream objects
    const streamMatches = raw.match(/stream\s*(.*?)\s*endstream/gs);
    if (streamMatches && streamMatches.length > 0) {
      const extracted = streamMatches
        .map(match => match.replace(/stream|endstream/g, ''))
        .join(' ')
        .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (extracted.length > 50) {
        console.log(`📄 Binary extraction found ${extracted.length} characters from ${streamMatches.length} streams`);
        return extracted;
      }
    }

    // Last resort: extract any printable ASCII from raw binary
    const printable = raw
      .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 50000);

    console.log(`📄 Raw printable extraction found ${printable.length} characters`);
    return printable;
  }

  static async extractFromDOCX(buffer: Buffer): Promise<string> {
    // Attempt 1: mammoth (works well for .docx, not for legacy .doc)
    try {
      const result = await mammoth.extractRawText({ buffer });
      if (result.value && result.value.trim().length > 50) {
        console.log(`📄 mammoth extracted ${result.value.length} characters`);
        return result.value;
      }
      console.warn('⚠️ mammoth returned insufficient text, trying LibreOffice...');
    } catch (error) {
      console.warn('⚠️ mammoth failed (likely a .doc file), trying LibreOffice...', error);
    }

    // Attempt 2: LibreOffice CLI (handles .doc and problematic .docx)
    return this.convertWithLibreOffice(buffer, 'doc');
  }

  /**
   * Convert a document to plain text using LibreOffice headless mode.
   * Works for .doc, .docx, .rtf, .odt, and other formats LibreOffice supports.
   */
  static async convertWithLibreOffice(buffer: Buffer, ext: string): Promise<string> {
    const tmpId = `docuintelli-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `${tmpId}.${ext}`);

    try {
      fs.writeFileSync(inputPath, buffer);

      // Try common LibreOffice binary names
      const sofficeBin = this.findLibreOfficeBin();
      if (!sofficeBin) {
        throw new Error('LibreOffice not found. Install libreoffice to process .doc files.');
      }

      console.log(`📄 Converting with LibreOffice: ${sofficeBin}`);
      execSync(
        `"${sofficeBin}" --headless --convert-to txt:Text --outdir "${tmpDir}" "${inputPath}"`,
        { timeout: 60000, stdio: 'pipe' }
      );

      const outputPath = path.join(tmpDir, `${tmpId}.txt`);
      if (fs.existsSync(outputPath)) {
        const text = fs.readFileSync(outputPath, 'utf-8');
        // Clean up both files
        try { fs.unlinkSync(outputPath); } catch {}
        try { fs.unlinkSync(inputPath); } catch {}

        if (text.trim().length > 0) {
          console.log(`📄 LibreOffice extracted ${text.length} characters`);
          return text;
        }
      }

      throw new Error('LibreOffice conversion produced no output');
    } catch (error: any) {
      // Clean up input file on failure
      try { fs.unlinkSync(inputPath); } catch {}
      throw new Error(`LibreOffice conversion failed: ${error.message}`);
    }
  }

  /**
   * Find the LibreOffice binary on the system.
   */
  static findLibreOfficeBin(): string | null {
    const candidates = process.platform === 'win32'
      ? [
          'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
          'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
        ]
      : ['soffice', 'libreoffice'];

    for (const bin of candidates) {
      try {
        // On Unix, use 'which'; on Windows, check file existence for full paths
        if (process.platform === 'win32') {
          if (fs.existsSync(bin)) return bin;
        } else {
          execSync(`which "${bin}"`, { stdio: 'pipe' });
          return bin;
        }
      } catch {
        // not found, try next
      }
    }

    return null;
  }

  static async extractFromImage(buffer: Buffer): Promise<string> {
    try {
      console.log('Starting OCR extraction from image...');
      const { data: { text } } = await Tesseract.recognize(buffer, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      });

      console.log('OCR extraction completed');

      if (!text || text.trim().length === 0) {
        throw new Error('No text found in image');
      }

      return text;
    } catch (error) {
      console.error('Image OCR extraction error:', error);
      throw new Error('Failed to extract text from image');
    }
  }

  /**
   * Sanitize text by removing null bytes, control characters, and unpaired surrogates.
   */
  static sanitizeText(text: string): string {
    let sanitized = text
      .replace(/\0/g, '')
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
      .replace(/\uFFFD/g, '')
      .replace(/[\uD800-\uDFFF]/g, '');

    try {
      sanitized = sanitized.normalize('NFC');
    } catch {
      // normalization failed, use as-is
    }

    return sanitized;
  }

  static chunkText(text: string, chunkSize: number = 1000, overlap: number = 100): Array<{ index: number; content: string }> {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const sanitized = this.sanitizeText(text);
    const chunks: Array<{ index: number; content: string }> = [];
    let start = 0;
    let index = 0;

    while (start < sanitized.length) {
      const end = start + chunkSize;
      const chunk = sanitized.slice(start, end).trim();

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
