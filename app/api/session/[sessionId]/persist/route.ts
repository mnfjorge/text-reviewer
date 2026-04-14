import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionPipelineState,
  putSessionPipelineState,
  saveLearningSession,
} from '@/lib/blob';
import { learningSessionFromPipeline } from '@/lib/learning-from-pipeline';

export const runtime = 'nodejs';

/**
 * Finishes persistence when analysis finished synthesis but save failed (or client retry).
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<NextResponse> {
  const { sessionId } = await params;

  try {
    const state = await getSessionPipelineState(sessionId);
    if (!state) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
    if (state.stage !== 'synthesized') {
      return NextResponse.json(
        { error: 'Session is not ready to persist' },
        { status: 400 },
      );
    }

    const createdAt = state.createdAt ?? new Date().toISOString();
    const session = learningSessionFromPipeline(
      { ...state, createdAt },
      '',
    );
    if (!session) {
      return NextResponse.json(
        { error: 'Incomplete session data' },
        { status: 400 },
      );
    }

    const blobUrl = await saveLearningSession({ ...session, createdAt, blobUrl: '' });
    await putSessionPipelineState({
      ...state,
      createdAt,
      stage: 'completed',
      learningBlobUrl: blobUrl,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ learningId: sessionId, blobUrl });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to persist learning';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
