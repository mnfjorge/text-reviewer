import { NextRequest, NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { getSessionPipelineState } from '@/lib/blob';

export const runtime = 'nodejs';

function asciiFallbackFilename(name: string): string {
  return name.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_') || 'download';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
): Promise<Response> {
  const { sessionId } = await params;
  const side = request.nextUrl.searchParams.get('side');
  if (side !== 'a' && side !== 'b') {
    return NextResponse.json({ error: 'Use side=a or side=b' }, { status: 400 });
  }

  try {
    const state = await getSessionPipelineState(sessionId);
    const file = side === 'a' ? state?.fileA : state?.fileB;
    if (!file?.sourceUrl) {
      return NextResponse.json(
        { error: 'Original file is not available for this session.' },
        { status: 404 },
      );
    }

    const blob = await get(file.sourceUrl, { access: 'private' });
    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      return NextResponse.json(
        { error: 'Could not read file from storage.' },
        { status: 502 },
      );
    }

    const safe = asciiFallbackFilename(file.name);
    const encoded = encodeURIComponent(file.name);

    return new NextResponse(blob.stream as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`,
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to serve file download';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
