import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  // Browsers sometimes send these for .doc/.docx
  'application/octet-stream',
  'application/zip',
];

export async function POST(request: NextRequest): Promise<Response> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_CONTENT_TYPES,
        maximumSizeInBytes: 100 * 1024 * 1024, // 100 MB
      }),
      onUploadCompleted: async () => {
        // Nothing to do — parse route handles cleanup after processing
      },
    });
    return jsonResponse;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload token error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
