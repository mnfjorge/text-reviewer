import Anthropic from '@anthropic-ai/sdk';
import { normalizeText, buildAlignedChunkPairs } from './chunker';
import { extractHeadingCandidates, type HeadingCandidate } from './heading-candidates';
import type { ChunkPair } from './types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/** Fast / low-cost model for outline matching only (not chunk analysis). */
const OUTLINE_MODEL =
  process.env.ANTHROPIC_OUTLINE_MODEL?.trim() || 'claude-haiku-4-5';

const OUTLINE_SYSTEM = `You map section headings between a SOURCE document and a TARGET document (often different languages).
You receive two numbered lists: SOURCE_HEADINGS and TARGET_HEADINGS. Each line is one candidate title from the file, in reading order.

Task: return pairs of ids (sourceId, targetId) that refer to the SAME logical section (same chapter/section), even when the wording differs or is translated.

Rules:
- Only use ids that appear in the lists.
- Pairs must be in ascending sourceId order; targetId must strictly increase as sourceId increases (no crossing alignments).
- Skip headings with no clear counterpart; do not guess weak matches.
- If the lists are sparse or unreliable, return an empty pairs array.
- Return ONLY valid JSON matching the schema.`;

const OUTLINE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    pairs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceId: { type: 'number' },
          targetId: { type: 'number' },
        },
        required: ['sourceId', 'targetId'],
        additionalProperties: false,
      },
    },
  },
  required: ['pairs'],
  additionalProperties: false,
};

interface RawOutlineResult {
  pairs: Array<{ sourceId: number; targetId: number }>;
}

function formatHeadingList(label: string, items: HeadingCandidate[]): string {
  const lines = items.map((h) => `${h.id}: ${h.text.replace(/\s+/g, ' ').trim()}`);
  return `${label} (${items.length} lines, ids 0–${Math.max(0, items.length - 1)}):\n${lines.join('\n')}`;
}

function sanitizePairs(
  raw: RawOutlineResult | null,
  sourceLen: number,
  targetLen: number,
): Array<{ sourceId: number; targetId: number }> {
  if (!raw?.pairs?.length) return [];
  const valid: Array<{ sourceId: number; targetId: number }> = [];
  for (const p of raw.pairs) {
    const s = Math.floor(Number(p.sourceId));
    const t = Math.floor(Number(p.targetId));
    if (!Number.isFinite(s) || !Number.isFinite(t)) continue;
    if (s < 0 || t < 0 || s >= sourceLen || t >= targetLen) continue;
    valid.push({ sourceId: s, targetId: t });
  }
  valid.sort((a, b) => a.sourceId - b.sourceId);
  const monotonic: Array<{ sourceId: number; targetId: number }> = [];
  let lastT = -1;
  let lastS = -1;
  for (const p of valid) {
    if (p.sourceId <= lastS) continue;
    if (p.targetId <= lastT) continue;
    monotonic.push(p);
    lastS = p.sourceId;
    lastT = p.targetId;
  }
  return monotonic;
}

async function callOutlineModel(
  sourceHeadings: HeadingCandidate[],
  targetHeadings: HeadingCandidate[],
): Promise<Array<{ sourceId: number; targetId: number }>> {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    return [];
  }
  if (sourceHeadings.length === 0 || targetHeadings.length === 0) {
    return [];
  }

  const user = `${formatHeadingList('SOURCE_HEADINGS', sourceHeadings)}

${formatHeadingList('TARGET_HEADINGS', targetHeadings)}

Return { "pairs": [ { "sourceId": number, "targetId": number }, ... ] } for headings that correspond to the same section.`;

  const response = await anthropic.messages.create({
    model: OUTLINE_MODEL,
    max_tokens: 2048,
    system: OUTLINE_SYSTEM,
    messages: [{ role: 'user', content: user }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: OUTLINE_SCHEMA,
      },
    },
  });

  const rawText =
    response.content[0].type === 'text' ? response.content[0].text : '{}';
  try {
    const parsed = JSON.parse(rawText) as RawOutlineResult;
    return sanitizePairs(parsed, sourceHeadings.length, targetHeadings.length);
  } catch {
    return [];
  }
}

interface Anchor {
  sourceOffset: number;
  targetOffset: number;
}

/**
 * Parse → chunk: optional LLM outline alignment (cheap model), then proportional
 * chunking within each aligned span. Falls back to global proportional alignment.
 */
export async function buildChunkPairsForParse(
  textA: string,
  textB: string,
): Promise<ChunkPair[]> {
  const a = normalizeText(textA);
  const b = normalizeText(textB);

  const hs = extractHeadingCandidates(a);
  const ht = extractHeadingCandidates(b);

  if (hs.length < 2 || ht.length < 2) {
    return buildAlignedChunkPairs(textA, textB);
  }

  let pairs: Array<{ sourceId: number; targetId: number }> = [];
  try {
    pairs = await callOutlineModel(hs, ht);
  } catch {
    return buildAlignedChunkPairs(textA, textB);
  }

  if (pairs.length < 2) {
    return buildAlignedChunkPairs(textA, textB);
  }

  const mid: Anchor[] = [];
  for (const p of pairs) {
    const sh = hs[p.sourceId];
    const th = ht[p.targetId];
    if (!sh || !th) continue;
    mid.push({ sourceOffset: sh.start, targetOffset: th.start });
  }
  mid.sort((x, y) => x.sourceOffset - y.sourceOffset);

  const deduped: Anchor[] = [{ sourceOffset: 0, targetOffset: 0 }];
  for (const c of mid) {
    const last = deduped[deduped.length - 1];
    if (c.sourceOffset <= last.sourceOffset || c.targetOffset <= last.targetOffset) {
      continue;
    }
    deduped.push(c);
  }
  const end: Anchor = { sourceOffset: a.length, targetOffset: b.length };
  const last = deduped[deduped.length - 1];
  if (end.sourceOffset > last.sourceOffset && end.targetOffset > last.targetOffset) {
    deduped.push(end);
  } else if (deduped.length === 1) {
    deduped.push(end);
  }

  if (deduped.length < 3) {
    return buildAlignedChunkPairs(textA, textB);
  }

  const merged: ChunkPair[] = [];
  for (let i = 0; i < deduped.length - 1; i++) {
    const from = deduped[i];
    const to = deduped[i + 1];
    const sliceA = a.slice(from.sourceOffset, to.sourceOffset);
    const sliceB = b.slice(from.targetOffset, to.targetOffset);
    if (!sliceA.trim() && !sliceB.trim()) continue;
    const sub = buildAlignedChunkPairs(sliceA, sliceB);
    for (const pair of sub) {
      merged.push({
        index: merged.length,
        source: {
          index: merged.length,
          text: pair.source.text,
          wordCount: pair.source.wordCount,
        },
        target: {
          index: merged.length,
          text: pair.target.text,
          wordCount: pair.target.wordCount,
        },
      });
    }
  }

  return merged.length > 0 ? merged : buildAlignedChunkPairs(textA, textB);
}
