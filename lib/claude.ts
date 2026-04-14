import Anthropic from '@anthropic-ai/sdk';
import type { ChunkAnalysis, ChunkPair } from './types';

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

Return a single JSON object with one field: **rulesMarkdown** — a complete Markdown document that will be pasted later as **instructions for another LLM** applying the same document pair’s conventions.

**Language (mandatory):** Write the **entire** \`rulesMarkdown\` document in **Brazilian Portuguese (pt-BR)** — all titles, section headings, bullets, explanations, and meta text. Use natural wording for Brazil (você / imperativo, terminologia comum em revisão e localização). You may keep **short quoted excerpts** from the source/target documents in their **original language** when they illustrate a rule; everything you add around them must still be in pt-BR.

Requirements for **rulesMarkdown**:
- Start with a level-1 title naming the document pair and purpose (e.g. regras de revisão / localização).
- Use \`##\` sections for each major theme you infer from the insights.
- Use **imperative**, testable bullets (what to do / what to avoid), not vague prose.
- Where helpful, add short **sub-bullets** with concrete before→after or terminology guidance drawn from the insights.
- Prefer depth over repetition; merge duplicate themes.
- If any chunk had non-empty insights, the document must be **substantive** (not empty and not a single generic sentence).
- If every chunk’s insights were empty, write a brief Markdown note in pt-BR that no rules could be inferred.`;

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

/** JSON schema for structured synthesis output (Anthropic `output_config.format`). */
const SYNTHESIS_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    rulesMarkdown: { type: 'string' },
  },
  required: ['rulesMarkdown'],
  additionalProperties: false,
};

interface RawSynthesisResult {
  rulesMarkdown: string;
}

function parseRulesMarkdown(rawText: string): string {
  try {
    const parsed = JSON.parse(rawText) as RawSynthesisResult;
    return typeof parsed.rulesMarkdown === 'string'
      ? parsed.rulesMarkdown.trim()
      : '';
  } catch {
    return '';
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
): Promise<string> {
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

  return parseRulesMarkdown(rawText);
}
