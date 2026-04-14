import { NextRequest, NextResponse } from 'next/server';
import { getLearningSession } from '@/lib/blob';
import { streamRevision } from '@/lib/revise';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await params;

  let text: string;
  try {
    const body = await req.json();
    text = typeof body.text === 'string' ? body.text.trim() : '';
  } catch {
    return NextResponse.json({ error: 'JSON inválido no corpo' }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: 'O campo text é obrigatório' }, { status: 400 });
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

  const revisionStream = await streamRevision(text, session);

  return new Response(revisionStream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
