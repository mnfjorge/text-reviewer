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

export interface ChangeItem {
  type: 'addition' | 'deletion' | 'substitution' | 'reorder' | 'style' | 'tone';
  sourceFragment: string;
  targetFragment: string;
  explanation: string;
}

export interface ChunkAnalysis {
  chunkIndex: number;
  changes: ChangeItem[];
  patterns: string[];
  confidence: number;
  rawResponse: string;
}

export interface GlobalPattern {
  patternType: string;
  description: string;
  exampleCount: number;
  examples: Array<{ source: string; target: string }>;
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

export interface AnalyzeRequest {
  sessionId: string;
  pairs: ChunkPair[];
  fileA: { name: string; size: number };
  fileB: { name: string; size: number };
  name?: string;
}

// ---- SSE Events ----

export type AnalyzeStreamEvent =
  | { type: 'chunk_start'; chunkIndex: number; total: number }
  | { type: 'chunk_complete'; chunkIndex: number; analysis: ChunkAnalysis }
  | { type: 'synthesis'; globalPatterns: GlobalPattern[] }
  | { type: 'saved'; learningId: string; blobUrl: string }
  | { type: 'error'; message: string };
