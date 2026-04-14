import Anthropic from '@anthropic-ai/sdk';
import type { ChunkAnalysis, ChunkPair } from './types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-6';

const CHUNK_SYSTEM_PROMPT = `Você é um analista linguístico especializado em comparação de documentos.
Em cada solicitação você vê **três janelas** de texto alinhado: par opcional **ANTERIOR**, par **ATUAL** e par opcional **SEGUINTE**. Cada janela contém **FONTE** e **META** para o mesmo trecho do documento.

O processamento pode desalinhar levemente nos limites dos trechos. Use ANTERIOR e SEGUINTE **apenas como contexto** — para ver continuidade, corrigir desvio ou captar regras que atravessam o limite. Sua resposta JSON deve refletir observações do par **ATUAL**: priorize o que está ancorado na FONTE vs META **atuais**. Use o campo \`basis\` só quando o contexto vizinho for essencial.

Sua tarefa **não** é listar todas as microedições. Produza **insights**: raciocínios concisos e reutilizáveis que um revisor queira lembrar — convenções, equivalências, tom ou registro, adaptação cultural, política terminológica e *por que* a leitura na META difere da FONTE.

**Idioma (obrigatório):** Todo o texto em \`insight\` e, se existir, em \`basis\` deve estar em **português do Brasil (pt-BR)**. Citações muito curtas dos documentos podem manter o idioma original entre aspas; o comentário ao redor permanece em pt-BR.

Regras:
- Cada insight deve funcionar sozinho como orientação (o que esperar ou fazer da próxima vez), não só descrever uma troca isolada, salvo quando essa troca codifica uma regra.
- Prefira menos insights e mais nítidos (cerca de 2–6 por trecho quando o texto permitir; no máximo 10; array vazio se os trechos forem quase idênticos e não houver o que ensinar).
- \`basis\` (opcional): uma linha curta ancorando o insight no que você viu (ex.: trecho FONTE vs META). Não cole blocos longos.
- \`confidence\`: quão bem os insights estão sustentados pelo par visível (0,0 a 1,0).
- Devolva **somente** JSON válido conforme o schema. Sem markdown fora do JSON e sem preâmbulo.`;

const SYNTHESIS_SYSTEM_PROMPT = `Você é um analista linguístico. Recebeu **insights por trecho** ao comparar um documento-fonte a um documento-meta em várias seções alinhadas.

Devolva um único objeto JSON com o campo **rulesMarkdown**: um documento Markdown completo que será colado depois como **instruções para outro modelo** reproduzir as convenções desse par de documentos.

**Idioma (obrigatório):** Escreva o **documento inteiro** em **português do Brasil (pt-BR)** — títulos, seções, listas e explicações. Tom natural no Brasil (imperativo / “você” quando fizer sentido, vocabulário de revisão e localização). Pode manter **citações curtas** da FONTE ou da META no **idioma original** quando ilustrarem uma regra; todo o texto que você acrescentar ao redor deve estar em pt-BR.

Requisitos do **rulesMarkdown**:
- Comece com título nível 1 com o par de documentos e o propósito (ex.: regras de revisão / localização).
- Use seções \`##\` para cada tema importante inferido dos insights.
- Use listas com **verbos no imperativo**, testáveis (o que fazer / o que evitar), evite vagueza.
- Quando ajudar, subitens com orientação concreta (antes → depois ou terminologia) extraída dos insights.
- Prefira profundidade a repetição; una temas duplicados.
- Se houver insights não vazios em qualquer trecho, o documento deve ser **substancial** (não vazio nem uma frase genérica só).
- Se todos os insights estiverem vazios, escreva em pt-BR uma nota Markdown breve de que não foi possível inferir regras.`;

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
  const label =
    role === 'PREVIOUS'
      ? 'ANTERIOR'
      : role === 'CURRENT'
        ? 'ATUAL'
        : 'SEGUINTE';
  if (!pair) {
    const edge =
      role === 'PREVIOUS'
        ? 'início do documento (sem trecho anterior)'
        : 'fim do documento (sem trecho seguinte)';
    return `--- ${label} (${edge}) ---\n(sem texto)\n`;
  }
  return `--- ${label} — trecho ${pair.index + 1} de ${totalChunks} ---\nFONTE:\n${pair.source.text}\n\nMETA:\n${pair.target.text}\n`;
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

  const userContent = `TRECHO EM FOCO (para seus insights): ${chunkIndex + 1} de ${totalChunks}

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

  const userContent = `Par de documentos: "${fileNames.a}" e "${fileNames.b}"
Total de trechos analisados: ${analyses.length}

Observações por trecho (sintetize entre todas):
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
