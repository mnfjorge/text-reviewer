import Anthropic from '@anthropic-ai/sdk';
import type { LearningSession } from './types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

function buildRevisionSystemPrompt(session: LearningSession): string {
  const md = session.rulesMarkdown?.trim() ?? '';

  return `Você é um editor profissional e revisor de texto.

Você estudou uma sessão de comparação de documentos intitulada "${session.name}".
Os documentos comparados foram: "${session.fileA.name}" (original) → "${session.fileB.name}" (revisado / meta).

Siga as regras abaixo (Markdown). Elas sintetizam padrões recorrentes dessa sessão.

---

${md}

---

Sua tarefa:
- Aplique essas convenções com fidelidade e consistência ao revisar o texto enviado pelo usuário.
- Quando o usuário fornecer feedback sobre uma revisão anterior, incorpore esse feedback respeitando as convenções acima.
- Preserve o sentido original e não acrescente informações novas.
- Mantenha o **idioma do texto de entrada** na resposta (revise no mesmo idioma em que o usuário escreveu).
- Devolva **somente** o texto revisado — sem comentários, explicações ou preâmbulo.
- O texto deve ser formatado em texto plano (sem markdown) e codificado em UTF-8;`;
}

/**
 * Transmite em fluxo uma revisão usando o histórico completo da conversa.
 * A primeira mensagem do usuário deve conter o texto a revisar.
 * As mensagens seguintes carregam saídas anteriores do assistente + feedback do usuário
 * para refinamento iterativo.
 */
export async function streamRevision(
  messages: ConversationMessage[],
  session: LearningSession,
): Promise<ReadableStream<Uint8Array>> {
  const systemPrompt = buildRevisionSystemPrompt(session);
  const encoder = new TextEncoder();

  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: 4096,
    system: [
      {
        type: 'text',
        text: systemPrompt,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages,
  });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
