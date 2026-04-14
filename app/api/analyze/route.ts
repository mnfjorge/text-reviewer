import { NextRequest } from 'next/server';
import { analyzeChunkPair, synthesizePatterns } from '@/lib/claude';
import {
  getSessionPipelineState,
  putSessionPipelineState,
  saveLearningSession,
} from '@/lib/blob';
import { learningSessionFromPipeline } from '@/lib/learning-from-pipeline';
import {
  limitPairsForAnalysis,
  MAX_ANALYSIS_CHUNKS,
} from '@/lib/analyze-constants';
import type {
  AnalyzeRequest,
  AnalyzeStreamEvent,
  ChunkAnalysis,
  LearningSession,
  SessionPipelineState,
} from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

function sseEvent(event: AnalyzeStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: AnalyzeRequest;
  try {
    body = (await request.json()) as AnalyzeRequest;
  } catch {
    return new Response('JSON inválido no corpo da solicitação', { status: 400 });
  }

  const { sessionId, pairs, fileA, fileB, name, existingAnalyses } = body;

  if (!sessionId || !pairs || pairs.length === 0) {
    return new Response('sessionId e pairs são obrigatórios', { status: 400 });
  }

  const pairsLimited = limitPairsForAnalysis(pairs);

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AnalyzeStreamEvent) => {
        controller.enqueue(encoder.encode(sseEvent(event)));
      };

      const existing = (existingAnalyses ?? []).slice(0, MAX_ANALYSIS_CHUNKS);
      if (existing.length > pairsLimited.length) {
        send({
          type: 'error',
          message: 'existingAnalyses é mais longo que pairs',
        });
        controller.close();
        return;
      }

      const analyses: ChunkAnalysis[] = [...existing];

      try {
        const pipeline = await getSessionPipelineState(sessionId);
        const createdAt = pipeline?.createdAt ?? new Date().toISOString();

        const fileAMerged = {
          ...(pipeline?.fileA ?? { name: 'Arquivo A', size: 0 }),
          ...(fileA ?? {}),
        };
        const fileBMerged = {
          ...(pipeline?.fileB ?? { name: 'Arquivo B', size: 0 }),
          ...(fileB ?? {}),
        };

        const baseState: SessionPipelineState = {
          sessionId,
          updatedAt: new Date().toISOString(),
          createdAt,
          stage: 'analyzing',
          name:
            name ??
            pipeline?.name ??
            `${fileAMerged.name} vs ${fileBMerged.name}`,
          fileA: fileAMerged,
          fileB: fileBMerged,
          pairs: pairsLimited,
          analyses,
        };

        await putSessionPipelineState(baseState);

        for (let i = existing.length; i < pairsLimited.length; i++) {
          send({
            type: 'chunk_start',
            chunkIndex: i,
            total: pairsLimited.length,
          });

          const analysis = await analyzeChunkPair(pairsLimited, i);
          analyses.push(analysis);

          await putSessionPipelineState({
            ...baseState,
            updatedAt: new Date().toISOString(),
            analyses: [...analyses],
          });

          send({ type: 'chunk_complete', chunkIndex: i, analysis });
        }

        const rulesMarkdown = await synthesizePatterns(analyses, {
          a: fileAMerged.name,
          b: fileBMerged.name,
        });
        send({
          type: 'synthesis',
          rulesMarkdown,
        });

        await putSessionPipelineState({
          ...baseState,
          updatedAt: new Date().toISOString(),
          stage: 'synthesized',
          analyses,
          rulesMarkdown,
        });

        const sessionPayload: SessionPipelineState = {
          ...baseState,
          updatedAt: new Date().toISOString(),
          stage: 'synthesized',
          analyses,
          rulesMarkdown,
          createdAt,
        };

        const built = learningSessionFromPipeline(sessionPayload, '');
        if (!built) {
          send({
            type: 'error',
            message: 'Não foi possível montar a sessão de aprendizado',
          });
          return;
        }

        const session: LearningSession = {
          ...built,
          createdAt,
          blobUrl: '',
        };

        const blobUrl = await saveLearningSession(session);

        await putSessionPipelineState({
          ...sessionPayload,
          stage: 'completed',
          learningBlobUrl: blobUrl,
          updatedAt: new Date().toISOString(),
        });

        send({ type: 'saved', learningId: sessionId, blobUrl });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Falha na análise';
        send({ type: 'error', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
