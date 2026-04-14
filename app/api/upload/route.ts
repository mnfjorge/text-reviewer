import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        maximumSizeInBytes: 100 * 1024 * 1024, // 100 MB
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {
        // Nothing to do — parse route handles cleanup after processing
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Erro ao gerar token de envio';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
