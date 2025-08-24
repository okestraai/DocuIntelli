export class TextChunker {
  private static readonly CHUNK_SIZE = 800;
  private static readonly OVERLAP_SIZE = 100;

  static chunkText(text: string): string[] {
    if (!text || text.trim().length === 0) {
      return [];
    }

    const chunks: string[] = [];
    const sentences = this.splitIntoSentences(text);
    
    let currentChunk = '';
    
    for (const sentence of sentences) {
      // If adding this sentence would exceed chunk size
      if (currentChunk.length + sentence.length > this.CHUNK_SIZE) {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        
        // Start new chunk with overlap from previous chunk
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(this.OVERLAP_SIZE / 6)); // Approximate word count for overlap
        currentChunk = overlapWords.join(' ') + ' ' + sentence;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
      }
    }
    
    // Add the last chunk if it has content
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks.filter(chunk => chunk.length > 50); // Filter out very small chunks
  }

  private static splitIntoSentences(text: string): string[] {
    // Clean up the text
    const cleanText = text.replace(/\s+/g, ' ').trim();
    
    // Split by sentence endings, but be careful with abbreviations
    const sentences = cleanText.split(/(?<=[.!?])\s+(?=[A-Z])/);
    
    return sentences.filter(sentence => sentence.trim().length > 0);
  }
}