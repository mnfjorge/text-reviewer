import { NextResponse } from 'next/server';
import { listLearningSessions } from '@/lib/blob';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    const sessions = await listLearningSessions();
    return NextResponse.json(sessions);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list learnings';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
