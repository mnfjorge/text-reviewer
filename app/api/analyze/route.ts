import { NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { analyzeChunkPair, synthesizePatterns } from '@/lib/claude';
import { saveLearningSession } from '@/lib/blob';
import type {
  AnalyzeRequest,
  AnalyzeStreamEvent,
  ChunkAnalysis,
  LearningSession,
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
    return new Response('Invalid JSON body', { status: 400 });
  }

  const { sessionId, pairs, fileA, fileB, name } = body;

  if (!sessionId || !pairs || pairs.length === 0) {
    return new Response('sessionId and pairs are required', { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AnalyzeStreamEvent) => {
        controller.enqueue(encoder.encode(sseEvent(event)));
      };

      try {
        const analyses: ChunkAnalysis[] = [];

        for (let i = 0; i < pairs.length; i++) {
          const pair = pairs[i];
          send({ type: 'chunk_start', chunkIndex: i, total: pairs.length });

          const analysis = await analyzeChunkPair(pair, pairs.length);
          analyses.push(analysis);

          send({ type: 'chunk_complete', chunkIndex: i, analysis });
        }

        const globalPatterns = await synthesizePatterns(analyses, {
          a: fileA?.name ?? 'File A',
          b: fileB?.name ?? 'File B',
        });
        send({ type: 'synthesis', globalPatterns });

        const learningId = uuidv4();
        const session: LearningSession = {
          id: learningId,
          createdAt: new Date().toISOString(),
          name: name ?? `${fileA?.name ?? 'File A'} vs ${fileB?.name ?? 'File B'}`,
          fileA: fileA ?? { name: 'File A', size: 0 },
          fileB: fileB ?? { name: 'File B', size: 0 },
          chunkCount: pairs.length,
          pairs,
          analyses,
          globalPatterns,
          blobUrl: '',
        };

        const blobUrl = await saveLearningSession(session);
        send({ type: 'saved', learningId, blobUrl });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Analysis failed';
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
