import type { TextChunk, ChunkPair } from './types';

const TARGET_WORDS = 400;

export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function countWords(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

export function groupIntoChunks(
  paragraphs: string[],
  targetWords: number = TARGET_WORDS,
): TextChunk[] {
  const chunks: TextChunk[] = [];
  let current: string[] = [];
  let currentWords = 0;

  for (const para of paragraphs) {
    const paraWords = countWords(para);

    if (currentWords > 0 && currentWords + paraWords > targetWords) {
      const text = current.join('\n\n');
      chunks.push({ index: chunks.length, text, wordCount: currentWords });
      current = [para];
      currentWords = paraWords;
    } else {
      current.push(para);
      currentWords += paraWords;
    }
  }

  if (current.length > 0) {
    const text = current.join('\n\n');
    chunks.push({ index: chunks.length, text, wordCount: currentWords });
  }

  return chunks;
}

function equalNChunks(paragraphs: string[], n: number): TextChunk[] {
  const chunks: TextChunk[] = [];
  const size = Math.ceil(paragraphs.length / n);
  for (let i = 0; i < n; i++) {
    const slice = paragraphs.slice(i * size, (i + 1) * size);
    if (slice.length === 0) break;
    const text = slice.join('\n\n');
    chunks.push({ index: i, text, wordCount: countWords(text) });
  }
  return chunks;
}

export function alignChunkPairs(
  chunksA: TextChunk[],
  chunksB: TextChunk[],
): ChunkPair[] {
  const countA = chunksA.length;
  const countB = chunksB.length;

  if (countA === countB) {
    return chunksA.map((source, i) => ({ index: i, source, target: chunksB[i] }));
  }

  // If counts differ by more than 20%, re-chunk the longer one to match the shorter
  const ratio = Math.max(countA, countB) / Math.min(countA, countB);
  if (ratio > 1.2) {
    const targetCount = Math.min(countA, countB);
    if (countA > countB) {
      const paragraphs = chunksA.flatMap((c) => c.text.split('\n\n'));
      const rebalanced = equalNChunks(paragraphs, targetCount);
      return rebalanced.map((source, i) => ({
        index: i,
        source,
        target: chunksB[i] ?? chunksB[chunksB.length - 1],
      }));
    } else {
      const paragraphs = chunksB.flatMap((c) => c.text.split('\n\n'));
      const rebalanced = equalNChunks(paragraphs, targetCount);
      return chunksA.map((source, i) => ({
        index: i,
        source,
        target: rebalanced[i] ?? rebalanced[rebalanced.length - 1],
      }));
    }
  }

  // Counts differ by ≤20%: pair by index, extending the shorter with its last chunk
  const maxLen = Math.max(countA, countB);
  const pairs: ChunkPair[] = [];
  for (let i = 0; i < maxLen; i++) {
    pairs.push({
      index: i,
      source: chunksA[i] ?? chunksA[chunksA.length - 1],
      target: chunksB[i] ?? chunksB[chunksB.length - 1],
    });
  }
  return pairs;
}

export function chunkText(text: string): TextChunk[] {
  const normalized = normalizeText(text);
  const paragraphs = splitIntoParagraphs(normalized);
  return groupIntoChunks(paragraphs);
}
