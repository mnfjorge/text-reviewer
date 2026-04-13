import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { parseFile, isSupportedFile } from '@/lib/parsers';
import { chunkText, alignChunkPairs } from '@/lib/chunker';
import type { ParseResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const fileA = formData.get('fileA');
  const fileB = formData.get('fileB');

  if (!(fileA instanceof File) || !(fileB instanceof File)) {
    return NextResponse.json(
      { error: 'Both fileA and fileB are required' },
      { status: 400 },
    );
  }

  for (const [label, file] of [['fileA', fileA], ['fileB', fileB]] as const) {
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `${label} exceeds the 10 MB limit` },
        { status: 400 },
      );
    }
    if (!isSupportedFile(file.name, file.type)) {
      return NextResponse.json(
        { error: `${label} (${file.name}) is not a supported file type. Use PDF, DOCX, or TXT.` },
        { status: 400 },
      );
    }
  }

  try {
    const [bufA, bufB] = await Promise.all([
      fileA.arrayBuffer().then((ab) => Buffer.from(ab)),
      fileB.arrayBuffer().then((ab) => Buffer.from(ab)),
    ]);

    const [textA, textB] = await Promise.all([
      parseFile(bufA, fileA.type, fileA.name),
      parseFile(bufB, fileB.type, fileB.name),
    ]);

    const chunksA = chunkText(textA);
    const chunksB = chunkText(textB);
    const pairs = alignChunkPairs(chunksA, chunksB);

    const sessionId = uuidv4();

    const response: ParseResponse = {
      sessionId,
      fileA: { name: fileA.name, size: fileA.size, chunkCount: chunksA.length },
      fileB: { name: fileB.name, size: fileB.size, chunkCount: chunksB.length },
      pairs,
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to parse files';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
