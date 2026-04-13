import { put, head, del, list } from '@vercel/blob';
import type { LearningMeta, LearningSession } from './types';

const INDEX_PATH = 'learnings/index.json';

export async function saveLearningSession(
  session: LearningSession,
): Promise<string> {
  const sessionPath = `learnings/${session.id}/session.json`;

  const { url } = await put(sessionPath, JSON.stringify(session), {
    access: 'public',
    contentType: 'application/json',
    allowOverwrite: false,
  });

  const meta: LearningMeta = {
    id: session.id,
    name: session.name,
    createdAt: session.createdAt,
    chunkCount: session.chunkCount,
    fileA: session.fileA.name,
    fileB: session.fileB.name,
    blobUrl: url,
  };

  await updateIndex((current) => [...current, meta]);
  return url;
}

export async function getLearningSession(
  id: string,
): Promise<LearningSession | null> {
  const sessionPath = `learnings/${id}/session.json`;
  try {
    // Check if the blob exists first
    const blobs = await list({ prefix: sessionPath });
    if (blobs.blobs.length === 0) return null;

    const blobUrl = blobs.blobs[0].url;
    const res = await fetch(blobUrl);
    if (!res.ok) return null;
    return (await res.json()) as LearningSession;
  } catch {
    return null;
  }
}

export async function listLearningSessions(): Promise<LearningMeta[]> {
  try {
    const blobs = await list({ prefix: INDEX_PATH });
    if (blobs.blobs.length === 0) return [];
    const res = await fetch(blobs.blobs[0].url);
    if (!res.ok) return [];
    return (await res.json()) as LearningMeta[];
  } catch {
    return [];
  }
}

export async function deleteLearningSession(id: string): Promise<void> {
  const sessionPath = `learnings/${id}/session.json`;
  try {
    const blobs = await list({ prefix: sessionPath });
    if (blobs.blobs.length > 0) {
      await del(blobs.blobs[0].url);
    }
  } catch {
    // Ignore if blob not found
  }
  await updateIndex((current) => current.filter((m) => m.id !== id));
}

async function updateIndex(
  updater: (current: LearningMeta[]) => LearningMeta[],
): Promise<void> {
  const current = await listLearningSessions();
  const updated = updater(current);
  await put(INDEX_PATH, JSON.stringify(updated), {
    access: 'public',
    contentType: 'application/json',
    allowOverwrite: true,
  });
}
