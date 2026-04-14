import type { ChunkPair } from './types';

/** Chunk pairs analyzed per session (LLM + synthesis); tail of long docs is skipped. */
export const MAX_ANALYSIS_CHUNKS = 30;

export function limitPairsForAnalysis(
  pairs: ChunkPair[],
  max: number = MAX_ANALYSIS_CHUNKS,
): ChunkPair[] {
  return pairs.slice(0, max).map((p, i) => ({
    ...p,
    index: i,
    source: { ...p.source, index: i },
    target: { ...p.target, index: i },
  }));
}
