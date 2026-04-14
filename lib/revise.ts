import Anthropic from '@anthropic-ai/sdk';
import type { LearningSession } from './types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

function buildRevisionSystemPrompt(session: LearningSession): string {
  const tail = `Your task:
- Apply these learned conventions faithfully and consistently to revise the user's input text.
- Preserve the original meaning and do not add new information.
- Return ONLY the revised text — no commentary, no explanation, no preamble.`;

  if (session.rulesMarkdown?.trim()) {
    return `You are a professional text editor and reviser.

You have studied a document comparison session titled "${session.name}".
The documents compared were: "${session.fileA.name}" (original) → "${session.fileB.name}" (revised).

Follow the rules below (Markdown). They synthesize recurring patterns from that session.

---

${session.rulesMarkdown.trim()}

---

${tail}`;
  }

  const patternList = session.globalPatterns
    .map((p, i) => {
      const examples = p.examples
        .slice(0, 2)
        .map((e) => `    • Before: "${e.source}"\n      After:  "${e.target}"`)
        .join('\n');
      return `${i + 1}. **${p.patternType}** (observed ${p.exampleCount}×)\n   ${p.description}\n${examples}`;
    })
    .join('\n\n');

  return `You are a professional text editor and reviser.

You have studied revision patterns extracted from a document comparison session titled "${session.name}".
The documents compared were: "${session.fileA.name}" (original) → "${session.fileB.name}" (revised).

The following transformation patterns were consistently applied across that session:

${patternList}

${tail}`;
}

/**
 * Streams a revised version of `text` using the patterns learned in `session`.
 * Returns a ReadableStream of text chunks suitable for an SSE or plain-text streaming response.
 */
export async function streamRevision(
  text: string,
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
    messages: [
      {
        role: 'user',
        content: `Please revise the following text:\n\n${text}`,
      },
    ],
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
