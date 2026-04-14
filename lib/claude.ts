import Anthropic from '@anthropic-ai/sdk';
import type {
  ChunkAnalysis,
  ChunkPair,
  GlobalPattern,
  SynthesisOutcome,
} from './types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-6';

const CHUNK_SYSTEM_PROMPT = `You are an expert linguistic analyst specializing in document comparison.
For each request you see **three windows** of aligned text: optional PREVIOUS chunk pair, **CURRENT** chunk pair, optional NEXT chunk pair. Each window has SOURCE and TARGET for the same stretch of the document.

The pipeline may mis-align slightly at chunk boundaries. Use PREVIOUS and NEXT **only as context**—to see how sentences continue, fix skew, or spot rules that span a boundary. Your JSON response must still reflect insights for the **CURRENT** pair: prioritize observations grounded in the CURRENT SOURCE vs CURRENT TARGET. Mention neighbors in a \`basis\` line only when that context is essential.

Your job is NOT to list every edit or micro-diff. Instead, produce **insights**: concise, reusable reasoning a human reviewer would want to remember—conventions, equivalences, tone or register choices, cultural adaptation, terminology policy, and *why* the target reads as it does relative to the source.

Good insight examples (illustrative):
- "In this Portuguese text, honorific 'Sri' is rendered as 'Senhor' before names; expect Sri → Senhor for the same devotional register."
- "The target uses sentence case for section headings while the source used title case; carry that style forward."
- "Technical acronym X is expanded on first use in the target only; follow that pattern for consistency."

Rules:
- Each insight should stand alone as guidance (what to expect or do next time), not just describe a single token swap unless that swap encodes a rule.
- Prefer fewer, sharper insights over many shallow ones (aim for roughly 2–6 per chunk when the text supports it; at most 10; empty array if the chunks are nearly identical with nothing to teach).
- Optional \`basis\`: one short line grounding the insight in what you saw (e.g. a phrase from source vs target). Do not paste large spans.
- \`confidence\`: how well-supported your insights are by the visible chunk pair (0.0–1.0).
- Return ONLY valid JSON matching the schema. No markdown or preamble.`;

const SYNTHESIS_SYSTEM_PROMPT = `You are an expert linguistic analyst. You have been given **chunk-level insights** from comparing a source document to a target document across many aligned sections.

Produce two linked outputs in JSON:

1) **rulesMarkdown** — A single Markdown document that will be pasted later as **instructions for another LLM** applying the same document pair’s conventions. Requirements:
   - Start with a level-1 title naming the document pair and purpose (e.g. revision / localization rules).
   - Use \`##\` sections for each major theme (match the high-level patterns you infer).
   - Use **imperative**, testable bullets (what to do / what to avoid), not vague prose.
   - Where helpful, add short **sub-bullets** with concrete before→after or terminology guidance drawn from the insights.
   - Prefer depth over repetition; merge duplicate themes.
   - If any chunk had non-empty insights, **rulesMarkdown must be substantive** (not an empty string and not a single generic sentence).

2) **globalPatterns** — The same themes in structured form for dashboards: 3–10 items when insights support it (minimum 1 if any insight text existed). Each item: patternType, description, exampleCount, examples (1–3 { source, target } pairs, ≤20 words each).

If every chunk’s insights were empty, \`globalPatterns\` may be [] and \`rulesMarkdown\` may briefly state that no rules could be inferred.`;

interface RawChunkResult {
  insights: Array<{ insight: string; basis?: string }>;
  confidence: number;
}

/** JSON schema for structured chunk analysis (Anthropic `output_config.format`). */
const CHUNK_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    insights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          insight: { type: 'string' },
          basis: { type: 'string' },
        },
        required: ['insight'],
        additionalProperties: false,
      },
    },
    confidence: { type: 'number' },
  },
  required: ['insights', 'confidence'],
  additionalProperties: false,
};

const globalPatternItemSchema: Record<string, unknown> = {
  type: 'object',
  properties: {
    patternType: { type: 'string' },
    description: { type: 'string' },
    exampleCount: { type: 'number' },
    examples: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          source: { type: 'string' },
          target: { type: 'string' },
        },
        required: ['source', 'target'],
        additionalProperties: false,
      },
    },
  },
  required: ['patternType', 'description', 'exampleCount', 'examples'],
  additionalProperties: false,
};

/** JSON schema for structured synthesis output (Anthropic `output_config.format`). */
const SYNTHESIS_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    rulesMarkdown: { type: 'string' },
    globalPatterns: {
      type: 'array',
      items: globalPatternItemSchema,
    },
  },
  required: ['rulesMarkdown', 'globalPatterns'],
  additionalProperties: false,
};

interface RawSynthesisResult {
  rulesMarkdown: string;
  globalPatterns: GlobalPattern[];
}

function normalizeGlobalPatterns(raw: unknown): GlobalPattern[] {
  if (!Array.isArray(raw)) return [];
  const out: GlobalPattern[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const patternType = String(o.patternType ?? '').trim() || 'Pattern';
    const description = String(o.description ?? '').trim() || '';
    const exampleCount =
      typeof o.exampleCount === 'number' && Number.isFinite(o.exampleCount)
        ? o.exampleCount
        : 0;
    let examples: GlobalPattern['examples'] = [];
    if (Array.isArray(o.examples)) {
      examples = o.examples
        .filter((e) => e && typeof e === 'object')
        .map((e) => {
          const ex = e as Record<string, unknown>;
          return {
            source: String(ex.source ?? '').trim(),
            target: String(ex.target ?? '').trim(),
          };
        })
        .filter((e) => e.source.length > 0 || e.target.length > 0);
    }
    if (examples.length === 0) {
      examples = [{ source: '(see description)', target: '(see description)' }];
    }
    out.push({ patternType, description, exampleCount, examples });
  }
  return out;
}

function parseSynthesisOutcome(rawText: string): SynthesisOutcome {
  try {
    const parsed = JSON.parse(rawText) as RawSynthesisResult;
    const rulesMarkdown =
      typeof parsed.rulesMarkdown === 'string' ? parsed.rulesMarkdown.trim() : '';
    return {
      rulesMarkdown,
      globalPatterns: normalizeGlobalPatterns(parsed.globalPatterns),
    };
  } catch {
    return { rulesMarkdown: '', globalPatterns: [] };
  }
}

function formatChunkWindow(
  role: 'PREVIOUS' | 'CURRENT' | 'NEXT',
  pair: ChunkPair | null,
  totalChunks: number,
): string {
  if (!pair) {
    const edge =
      role === 'PREVIOUS'
        ? 'start of document (no prior chunk)'
        : 'end of document (no following chunk)';
    return `--- ${role} (${edge}) ---\n(no text)\n`;
  }
  return `--- ${role} — chunk ${pair.index + 1} of ${totalChunks} ---\nSOURCE:\n${pair.source.text}\n\nTARGET:\n${pair.target.text}\n`;
}

export async function analyzeChunkPair(
  pairs: ChunkPair[],
  chunkIndex: number,
): Promise<ChunkAnalysis> {
  const totalChunks = pairs.length;
  const pair = pairs[chunkIndex];
  if (!pair) {
    return {
      chunkIndex,
      insights: [],
      confidence: 0,
      rawResponse: '',
    };
  }

  const prev = chunkIndex > 0 ? pairs[chunkIndex - 1] : null;
  const next = chunkIndex + 1 < pairs.length ? pairs[chunkIndex + 1] : null;

  const userContent = `FOCUS CHUNK (for your insights): ${chunkIndex + 1} of ${totalChunks}

${formatChunkWindow('PREVIOUS', prev, totalChunks)}
${formatChunkWindow('CURRENT', pair, totalChunks)}
${formatChunkWindow('NEXT', next, totalChunks)}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: [
      {
        type: 'text',
        text: CHUNK_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userContent }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: CHUNK_OUTPUT_SCHEMA,
      },
    },
  });

  const rawText =
    response.content[0].type === 'text' ? response.content[0].text : '';

  let parsed: RawChunkResult = { insights: [], confidence: 0.5 };
  try {
    parsed = JSON.parse(rawText) as RawChunkResult;
  } catch {
    // If JSON parse fails, return minimal analysis
  }

  const insights = (parsed.insights ?? [])
    .map((row) => ({
      insight: (row.insight ?? '').trim(),
      basis: row.basis?.trim() || undefined,
    }))
    .filter((row) => row.insight.length > 0)
    .slice(0, 10);

  return {
    chunkIndex,
    insights,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    rawResponse: rawText,
  };
}

export async function synthesizePatterns(
  analyses: ChunkAnalysis[],
  fileNames: { a: string; b: string },
): Promise<SynthesisOutcome> {
  const summary = analyses.map((a) => ({
    chunkIndex: a.chunkIndex,
    confidence: a.confidence,
    insights: a.insights.map((i) => ({
      insight: i.insight,
      basis: i.basis,
    })),
  }));

  const userContent = `Document pair: "${fileNames.a}" vs "${fileNames.b}"
Total chunks analyzed: ${analyses.length}

Per-chunk insights (synthesize across these):
${JSON.stringify(summary, null, 2)}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: [
      {
        type: 'text',
        text: SYNTHESIS_SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userContent }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: SYNTHESIS_OUTPUT_SCHEMA,
      },
    },
  });

  const rawText =
    response.content[0].type === 'text' ? response.content[0].text : '{}';

  return parseSynthesisOutcome(rawText);
}
