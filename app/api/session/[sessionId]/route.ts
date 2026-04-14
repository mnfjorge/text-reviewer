import { NextRequest, NextResponse } from 'next/server';
import { getSessionPipelineState } from '@/lib/blob';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  const { sessionId } = await params;
  try {
    const state = await getSessionPipelineState(sessionId);
    if (!state) {
      return NextResponse.json(null);
    }
    return NextResponse.json(state);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to load session state';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
