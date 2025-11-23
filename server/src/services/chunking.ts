export interface Chunk {
  index: number;
  content: string;
}

export interface ChunkingOptions {
  chunkSize?: number;
  overlap?: number;
}

export function chunkText(
  text: string,
  options: ChunkingOptions = {}
): Chunk[] {
  const chunkSize = options.chunkSize || 1000;
  const overlap = options.overlap || 100;

  if (!text || text.trim().length === 0) {
    return [];
  }

  const chunks: Chunk[] = [];
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < text.length) {
    const endIndex = Math.min(startIndex + chunkSize, text.length);
    const chunkContent = text.slice(startIndex, endIndex);

    chunks.push({
      index: chunkIndex,
      content: chunkContent.trim()
    });

    chunkIndex++;
    startIndex += chunkSize - overlap;

    if (startIndex >= text.length) {
      break;
    }
  }

  return chunks;
}
