import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { parseFile, isSupportedFile } from '@/lib/parsers';
import { alignChunkPairs, chunkText } from '@/lib/chunker';
import { getSessionPipelineState, putSessionPipelineState } from '@/lib/blob';
import type { ParseResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

interface ParseRequestBody {
  sessionId: string;
  fileA: { url: string; name: string; size: number };
  fileB: { url: string; name: string; size: number };
}

async function fetchBlob(url: string): Promise<Buffer> {
  const result = await get(url, { access: 'private' });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error('Não foi possível baixar o arquivo enviado');
  }
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: ParseRequestBody;
  try {
    body = (await request.json()) as ParseRequestBody;
  } catch {
    return NextResponse.json({ error: 'Corpo da solicitação inválido' }, { status: 400 });
  }

  const { sessionId, fileA, fileB } = body;

  if (!sessionId?.trim()) {
    return NextResponse.json({ error: 'sessionId é obrigatório' }, { status: 400 });
  }

  if (!fileA?.url || !fileB?.url) {
    return NextResponse.json(
      { error: 'É necessário enviar fileA e fileB' },
      { status: 400 },
    );
  }

  for (const { title, file } of [
    { title: 'Arquivo A', file: fileA },
    { title: 'Arquivo B', file: fileB },
  ] as const) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `${title} ultrapassa o limite de 100 MB` },
        { status: 400 },
      );
    }
    if (!isSupportedFile(file.name, 'application/octet-stream')) {
      return NextResponse.json(
        {
          error: `${title} (${file.name}) não é um tipo suportado. Use PDF, DOCX ou TXT.`,
        },
        { status: 400 },
      );
    }
  }

  try {
    const [bufA, bufB] = await Promise.all([
      fetchBlob(fileA.url),
      fetchBlob(fileB.url),
    ]);

    const [textA, textB] = await Promise.all([
      parseFile(bufA, '', fileA.name),
      parseFile(bufB, '', fileB.name),
    ]);

    const chunksA = chunkText(textA);
    const chunksB = chunkText(textB);
    const pairs = alignChunkPairs(chunksA, chunksB);

    const prev = await getSessionPipelineState(sessionId);
    const createdAt = prev?.createdAt ?? new Date().toISOString();

    await putSessionPipelineState({
      sessionId,
      updatedAt: new Date().toISOString(),
      createdAt,
      stage: 'parsed',
      fileA: { name: fileA.name, size: fileA.size, sourceUrl: fileA.url },
      fileB: { name: fileB.name, size: fileB.size, sourceUrl: fileB.url },
      pairs,
    });

    const response: ParseResponse = {
      sessionId,
      fileA: { name: fileA.name, size: fileA.size, chunkCount: chunksA.length },
      fileB: { name: fileB.name, size: fileB.size, chunkCount: chunksB.length },
      pairs,
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao processar os arquivos';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
