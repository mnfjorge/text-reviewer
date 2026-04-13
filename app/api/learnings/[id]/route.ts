import { NextRequest, NextResponse } from 'next/server';
import { getLearningSession, deleteLearningSession } from '@/lib/blob';

export const runtime = 'nodejs';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  try {
    const session = await getLearningSession(id);
    if (!session) {
      return NextResponse.json({ error: 'Learning session not found' }, { status: 404 });
    }
    return NextResponse.json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch learning';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  try {
    await deleteLearningSession(id);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete learning';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
