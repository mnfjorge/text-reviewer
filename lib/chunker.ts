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

function splitWords(text: string): string[] {
  return text.split(/\s+/).filter((w) => w.length > 0);
}

/** Inclusive start, exclusive end; safe for total === 0. */
function wordSliceRange(
  total: number,
  chunkIndex: number,
  chunkCount: number,
): [number, number] {
  if (total === 0) return [0, 0];
  const start = Math.floor((chunkIndex * total) / chunkCount);
  const end =
    chunkIndex === chunkCount - 1
      ? total
      : Math.floor(((chunkIndex + 1) * total) / chunkCount);
  return [start, Math.max(start, end)];
}

/**
 * Chunk file A vs file B into the same number of segments by **relative position**
 * through each document (linear alignment). Works across formats (e.g. PDF vs DOCX)
 * where paragraph breaks and page boundaries do not line up.
 */
export function buildAlignedChunkPairs(
  textA: string,
  textB: string,
  targetWords: number = TARGET_WORDS,
): ChunkPair[] {
  const a = normalizeText(textA);
  const b = normalizeText(textB);
  const wordsA = splitWords(a);
  const wordsB = splitWords(b);
  const wA = wordsA.length;
  const wB = wordsB.length;

  if (wA === 0 && wB === 0) return [];

  const n = Math.max(1, Math.ceil(Math.max(wA, wB) / targetWords));
  const pairs: ChunkPair[] = [];

  for (let i = 0; i < n; i++) {
    const [sA, eA] = wordSliceRange(wA, i, n);
    const [sB, eB] = wordSliceRange(wB, i, n);
    const chunkAText = wordsA.slice(sA, eA).join(' ');
    const chunkBText = wordsB.slice(sB, eB).join(' ');
    pairs.push({
      index: i,
      source: {
        index: i,
        text: chunkAText,
        wordCount: eA - sA,
      },
      target: {
        index: i,
        text: chunkBText,
        wordCount: eB - sB,
      },
    });
  }

  return pairs;
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
