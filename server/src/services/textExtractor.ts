import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';
import { pdfToPng } from 'pdf-to-png-converter';
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
      if (data.text && data.text.trim().length > 50 && this.isReadableText(data.text)) {
        console.log(`📄 pdf-parse extracted ${data.text.length} characters`);
        return data.text;
      }
      console.warn('⚠️ pdf-parse returned insufficient or unreadable text, trying binary extraction...');
    } catch (error) {
      console.warn('⚠️ pdf-parse failed, trying binary extraction...', error);
    }

    // Attempt 2: Raw binary stream extraction (same approach as edge function)
    const binaryText = this.extractFromPDFBinary(buffer);
    if (binaryText.length > 50 && this.isReadableText(binaryText)) {
      return binaryText;
    }

    // Attempt 3: OCR — PDF is likely scanned/image-based
    console.log('📄 Text extraction produced unreadable content, attempting OCR on PDF pages...');
    return this.extractFromPDFWithOCR(buffer);
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

  /**
   * Check if extracted text is actually readable (not binary garbage).
   * Counts the ratio of common English words in a sample — binary junk will have near zero.
   */
  static isReadableText(text: string): boolean {
    // Take a sample from the middle (avoids PDF headers/footers)
    const sample = text.slice(
      Math.max(0, Math.floor(text.length / 4)),
      Math.min(text.length, Math.floor(text.length / 4) + 2000)
    );

    // Split into "words" (sequences of alpha chars)
    const words = sample.match(/[a-zA-Z]{2,}/g) || [];
    if (words.length < 5) return false;

    // Common English words that appear in real documents
    const commonWords = new Set([
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her',
      'was', 'one', 'our', 'out', 'has', 'have', 'from', 'been', 'some',
      'this', 'that', 'with', 'will', 'each', 'make', 'like', 'long',
      'name', 'date', 'number', 'amount', 'total', 'policy', 'insurance',
      'agreement', 'contract', 'document', 'section', 'shall', 'must',
      'may', 'any', 'such', 'other', 'than', 'into', 'only', 'your',
      'which', 'their', 'would', 'there', 'could', 'about', 'more',
      'after', 'also', 'made', 'between', 'under', 'before', 'being',
      'through', 'where', 'should', 'over', 'upon', 'during', 'without',
    ]);

    const hits = words.filter(w => commonWords.has(w.toLowerCase())).length;
    const ratio = hits / words.length;

    // Readable text should have at least 5% common words
    const isReadable = ratio >= 0.05;
    if (!isReadable) {
      console.log(`📄 Text quality check: ${hits}/${words.length} common words (${(ratio * 100).toFixed(1)}%) — likely binary/garbage`);
    }
    return isReadable;
  }

  /**
   * OCR fallback for scanned/image-based PDFs.
   * Converts each PDF page to a PNG image, then runs Tesseract OCR on each.
   */
  static async extractFromPDFWithOCR(buffer: Buffer): Promise<string> {
    try {
      const pngPages = await pdfToPng(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer, {
        disableFontFace: true,
        viewportScale: 2.0, // Higher scale = better OCR accuracy
      });

      if (!pngPages || pngPages.length === 0) {
        throw new Error('pdf-to-png-converter produced no pages');
      }

      console.log(`📄 Converted PDF to ${pngPages.length} PNG page(s), starting OCR...`);

      const pageTexts: string[] = [];

      for (let i = 0; i < pngPages.length; i++) {
        const page = pngPages[i];
        if (!page.content || page.content.length === 0) {
          console.warn(`⚠️ Page ${i + 1} has no image content, skipping`);
          continue;
        }

        try {
          console.log(`📄 OCR page ${i + 1}/${pngPages.length}...`);
          const { data: { text } } = await Tesseract.recognize(page.content, 'eng', {
            logger: (m) => {
              if (m.status === 'recognizing text' && Math.round(m.progress * 100) % 25 === 0) {
                console.log(`  Page ${i + 1} OCR: ${Math.round(m.progress * 100)}%`);
              }
            }
          });

          if (text && text.trim().length > 0) {
            pageTexts.push(text.trim());
          }
        } catch (pageError) {
          console.warn(`⚠️ OCR failed on page ${i + 1}:`, pageError);
        }
      }

      const fullText = pageTexts.join('\n\n');

      if (fullText.length === 0) {
        throw new Error('OCR produced no text from any PDF page');
      }

      console.log(`📄 PDF OCR complete: extracted ${fullText.length} characters from ${pageTexts.length} page(s)`);
      return fullText;
    } catch (error: any) {
      console.error('📄 PDF OCR extraction failed:', error.message);
      throw new Error(`Failed to extract text from scanned PDF: ${error.message}`);
    }
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
