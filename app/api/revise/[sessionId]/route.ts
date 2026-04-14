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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  const session = await getLearningSession(sessionId);
  if (!session) {
    return NextResponse.json(
      { error: 'Learning session not found' },
      { status: 404 },
    );
  }

  if (!session.globalPatterns || session.globalPatterns.length === 0) {
    return NextResponse.json(
      { error: 'Session has no learned patterns to apply' },
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
