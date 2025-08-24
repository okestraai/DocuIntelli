import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import Tesseract from 'tesseract.js';
import fs from 'fs/promises';

export class TextExtractor {
  static async extractText(filePath: string, mimeType: string): Promise<string> {
    try {
      switch (mimeType) {
        case 'application/pdf':
          return await this.extractFromPDF(filePath);
        
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          return await this.extractFromDOCX(filePath);
        
        case 'image/png':
        case 'image/jpeg':
        case 'image/jpg':
        case 'image/tiff':
          return await this.extractFromImage(filePath);
        
        default:
          throw new Error(`Unsupported file type: ${mimeType}`);
      }
    } catch (error) {
      console.error('Text extraction error:', error);
      throw new Error(`Failed to extract text: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static async extractFromPDF(filePath: string): Promise<string> {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
  }

  private static async extractFromDOCX(filePath: string): Promise<string> {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  private static async extractFromImage(filePath: string): Promise<string> {
    const { data: { text } } = await Tesseract.recognize(filePath, 'eng', {
      logger: m => console.log(m)
    });
    return text;
  }
}