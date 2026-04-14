import { NextRequest, NextResponse } from 'next/server';
import { getSessionPipelineState } from '@/lib/blob';
import { synthesizePatterns } from '@/lib/claude';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  const pipeline = await getSessionPipelineState(sessionId);
  if (!pipeline) {
    return NextResponse.json({ error: 'session not found' }, { status: 404 });
  }

  if (!pipeline.analyses || pipeline.analyses.length === 0) {
    return NextResponse.json({ error: 'analyses not found' }, { status: 404 });
  }

  const synthesis = await synthesizePatterns(pipeline.analyses, {
    a: pipeline.fileA?.name ?? '',
    b: pipeline.fileB?.name ?? '',
  });

  return NextResponse.json(synthesis);
}
