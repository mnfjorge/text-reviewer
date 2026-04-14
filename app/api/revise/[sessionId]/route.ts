import { NextRequest, NextResponse } from 'next/server';
import { getLearningSession } from '@/lib/blob';
import { streamRevision } from '@/lib/revise';
import type { ConversationMessage } from '@/lib/revise';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await params;

  let messages: ConversationMessage[];
  try {
    const body = await req.json();

    if (Array.isArray(body.messages) && body.messages.length > 0) {
      // Multi-turn: full conversation history passed by the client
      messages = body.messages as ConversationMessage[];
    } else if (typeof body.text === 'string' && body.text.trim()) {
      // Initial revision shorthand: wrap plain text in a user message
      messages = [
        {
          role: 'user',
          content: `Revise o texto a seguir conforme as regras acima:\n\n${body.text.trim()}`,
        },
      ];
    } else {
      return NextResponse.json(
        { error: 'Forneça "messages" (array) ou "text" (string)' },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: 'JSON inválido no corpo' }, { status: 400 });
  }

  const session = await getLearningSession(sessionId);
  if (!session) {
    return NextResponse.json(
      { error: 'Sessão de aprendizado não encontrada' },
      { status: 404 },
    );
  }

  if (!session.rulesMarkdown?.trim()) {
    return NextResponse.json(
      { error: 'A sessão não tem documento de regras para aplicar' },
      { status: 422 },
    );
  }

  const revisionStream = await streamRevision(messages, session);

  return new Response(revisionStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
