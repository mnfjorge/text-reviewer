import Anthropic from '@anthropic-ai/sdk';
import type { ChunkAnalysis, ChunkPair, GlobalPattern } from './types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-6';

const CHUNK_SYSTEM_PROMPT = `You are an expert linguistic analyst specializing in document comparison.
Your task is to analyze a pair of text chunks — a SOURCE chunk and a TARGET chunk — which are corresponding sections from two versions of the same document. The document pair may represent: an original and its translation, an original and a reviewed/edited version, or a source and a localized adaptation.

Your analysis must be precise, evidence-based, and grounded only in what you observe in the text. Do not speculate beyond the evidence.

You will return a JSON object with this exact structure:
{
  "changes": [
    {
      "type": "<addition|deletion|substitution|reorder|style|tone>",
      "sourceFragment": "<exact excerpt from source, or empty string for additions>",
      "targetFragment": "<exact excerpt from target, or empty string for deletions>",
      "explanation": "<concise explanation of why this change was made>"
    }
  ],
  "patterns": [
    "<high-level pattern name, e.g. 'passive-to-active voice', 'formality reduction'>"
  ],
  "confidence": <0.0-1.0>
}

Rules:
- sourceFragment and targetFragment should be short (≤30 words) representative excerpts, not the entire chunk.
- patterns should capture recurring transformation rules visible in this chunk.
- confidence reflects how clearly the changes map between source and target.
- Return ONLY valid JSON. No markdown, no preamble, no explanation outside the JSON.`;

const SYNTHESIS_SYSTEM_PROMPT = `You are an expert linguistic analyst. You have been given a summary of chunk-level analyses from a document comparison session.

Your task is to synthesize these into a list of 3-8 high-level, recurring transformation patterns that characterize how the source document was changed to produce the target document.

Return a JSON array with this exact structure:
[
  {
    "patternType": "<short pattern name, e.g. 'passive-to-active voice'>",
    "description": "<clear description of the pattern and when it applies>",
    "exampleCount": <number of times this pattern was observed>,
    "examples": [
      { "source": "<short source excerpt>", "target": "<short target excerpt>" }
    ]
  }
]

Rules:
- Focus on patterns that repeat across multiple chunks, not one-off edits.
- Keep examples short (≤20 words each).
- Return ONLY valid JSON. No markdown, no preamble.`;

interface RawChunkResult {
  changes: Array<{
    type: string;
    sourceFragment: string;
    targetFragment: string;
    explanation: string;
  }>;
  patterns: string[];
  confidence: number;
}

export async function analyzeChunkPair(
  pair: ChunkPair,
  totalChunks: number,
): Promise<ChunkAnalysis> {
  const userContent = `CHUNK INDEX: ${pair.index + 1} of ${totalChunks}

SOURCE:
${pair.source.text}

TARGET:
${pair.target.text}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: CHUNK_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userContent }],
  });

  const rawText =
    response.content[0].type === 'text' ? response.content[0].text : '';

  let parsed: RawChunkResult = { changes: [], patterns: [], confidence: 0.5 };
  try {
    parsed = JSON.parse(rawText) as RawChunkResult;
  } catch {
    // If JSON parse fails, return minimal analysis
  }

  const validChangeTypes = new Set([
    'addition', 'deletion', 'substitution', 'reorder', 'style', 'tone',
  ]);

  return {
    chunkIndex: pair.index,
    changes: (parsed.changes ?? []).map((c) => ({
      type: validChangeTypes.has(c.type)
        ? (c.type as ChunkAnalysis['changes'][0]['type'])
        : 'substitution',
      sourceFragment: c.sourceFragment ?? '',
      targetFragment: c.targetFragment ?? '',
      explanation: c.explanation ?? '',
    })),
    patterns: parsed.patterns ?? [],
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    rawResponse: rawText,
  };
}

export async function synthesizePatterns(
  analyses: ChunkAnalysis[],
  fileNames: { a: string; b: string },
): Promise<GlobalPattern[]> {
  const summary = analyses.map((a) => ({
    chunkIndex: a.chunkIndex,
    patterns: a.patterns,
    changeTypes: a.changes.map((c) => c.type),
    sampleChanges: a.changes.slice(0, 3).map((c) => ({
      sourceFragment: c.sourceFragment,
      targetFragment: c.targetFragment,
    })),
  }));

  const userContent = `Document pair: "${fileNames.a}" vs "${fileNames.b}"
Total chunks analyzed: ${analyses.length}

Per-chunk pattern summary:
${JSON.stringify(summary, null, 2)}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: SYNTHESIS_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userContent }],
  });

  const rawText =
    response.content[0].type === 'text' ? response.content[0].text : '[]';

  try {
    return JSON.parse(rawText) as GlobalPattern[];
  } catch {
    return [];
  }
}
