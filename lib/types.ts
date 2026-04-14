// ---- Chunking ----

export interface TextChunk {
  index: number;
  text: string;
  wordCount: number;
}

export interface ChunkPair {
  index: number;
  source: TextChunk;
  target: TextChunk;
}

// ---- Claude Analysis ----

/** One transferable observation from comparing a chunk pair (not a granular diff). */
export interface ChunkInsight {
  /** Reasoning the reviewer should carry forward, e.g. naming or localization conventions. */
  insight: string;
  /** Optional one-line anchor from the chunks (not an exhaustive list of edits). */
  basis?: string;
}

export interface ChunkAnalysis {
  chunkIndex: number;
  insights: ChunkInsight[];
  confidence: number;
  rawResponse: string;
}

export interface GlobalPattern {
  patternType: string;
  description: string;
  exampleCount: number;
  examples: Array<{ source: string; target: string }>;
}

/** Result of cross-chunk synthesis: structured patterns plus a prompt-ready rules doc. */
export interface SynthesisOutcome {
  /** Markdown suitable to paste as instructions for another LLM (headings, imperative rules). */
  rulesMarkdown: string;
  globalPatterns: GlobalPattern[];
}

// ---- Stored Learning ----

export interface LearningSession {
  id: string;
  createdAt: string;
  name: string;
  fileA: { name: string; size: number };
  fileB: { name: string; size: number };
  chunkCount: number;
  pairs: ChunkPair[];
  analyses: ChunkAnalysis[];
  globalPatterns: GlobalPattern[];
  /** Synthesized revision/localization rules as Markdown (for downstream prompts). */
  rulesMarkdown?: string;
  blobUrl: string;
}

export interface LearningMeta {
  id: string;
  name: string;
  createdAt: string;
  chunkCount: number;
  fileA: string;
  fileB: string;
  blobUrl: string;
}

// ---- API Response shapes ----

export interface ParseResponse {
  sessionId: string;
  fileA: { name: string; size: number; chunkCount: number };
  fileB: { name: string; size: number; chunkCount: number };
  pairs: ChunkPair[];
}

/** Persisted workspace pipeline (URL session id = primary key). */
export type PipelineStage =
  | 'empty'
  | 'parsed'
  | 'analyzing'
  | 'synthesized'
  | 'completed';

export interface SessionPipelineState {
  sessionId: string;
  updatedAt: string;
  stage: PipelineStage;
  /** Display title for the learning record */
  name?: string;
  /** sourceUrl: private Vercel Blob URL for originals (set at parse; used for download). */
  fileA?: { name: string; size: number; sourceUrl?: string };
  fileB?: { name: string; size: number; sourceUrl?: string };
  pairs?: ChunkPair[];
  analyses?: ChunkAnalysis[];
  globalPatterns?: GlobalPattern[];
  /** Markdown rules doc from synthesis (same content intent as learnings blob). */
  rulesMarkdown?: string;
  learningBlobUrl?: string;
  createdAt?: string;
}

export interface AnalyzeRequest {
  sessionId: string;
  pairs: ChunkPair[];
  fileA: { name: string; size: number };
  fileB: { name: string; size: number };
  name?: string;
  /** When resuming after reload, pass completed chunk analyses in order. */
  existingAnalyses?: ChunkAnalysis[];
}

// ---- SSE Events ----

export type AnalyzeStreamEvent =
  | { type: 'chunk_start'; chunkIndex: number; total: number }
  | { type: 'chunk_complete'; chunkIndex: number; analysis: ChunkAnalysis }
  | {
      type: 'synthesis';
      globalPatterns: GlobalPattern[];
      rulesMarkdown: string;
    }
  | { type: 'saved'; learningId: string; blobUrl: string }
  | { type: 'error'; message: string };
