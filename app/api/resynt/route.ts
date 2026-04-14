import { NextRequest, NextResponse } from 'next/server';
import { getSessionPipelineState, putSessionPipelineState, saveLearningSession } from '@/lib/blob';
import { synthesizePatterns } from '@/lib/claude';
import { LearningSession, SessionPipelineState } from '@/lib/types';
import { learningSessionFromPipeline } from '@/lib/learning-from-pipeline';

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

  const rulesMarkdown = await synthesizePatterns(pipeline.analyses, {
    a: pipeline.fileA?.name ?? '',
    b: pipeline.fileB?.name ?? '',
  });

  const createdAt = pipeline.createdAt ?? new Date().toISOString();

  const sessionPayload: SessionPipelineState = {
    ...pipeline,
    updatedAt: new Date().toISOString(),
    stage: 'synthesized',
    rulesMarkdown,
    createdAt,
  };

  const built = learningSessionFromPipeline(sessionPayload, '');
  if (!built) {
    return NextResponse.json({ error: 'could not build learning session', sessionPayload })
  }

  const session: LearningSession = {
    ...built,
    blobUrl: '',
    createdAt,
  };

  const blobUrl = await saveLearningSession(session);

  await putSessionPipelineState({
    ...sessionPayload,
    stage: 'completed',
    learningBlobUrl: blobUrl,
    updatedAt: new Date().toISOString(),
  });

  return NextResponse.json({ rulesMarkdown });
}

