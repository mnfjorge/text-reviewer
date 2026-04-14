import { del, get, put } from '@vercel/blob';
import type { LearningMeta, LearningSession, SessionPipelineState } from './types';

const INDEX_PATH = 'learnings/index.json';

const sessionStatePath = (id: string) => `sessions/${id}/state.json`;

/** Private blobs must be read via the SDK — plain `fetch(url)` is not authorized. */
async function readJsonBlob<T>(pathname: string): Promise<T | null> {
  try {
    const result = await get(pathname, { access: 'private' });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export async function getSessionPipelineState(
  id: string,
): Promise<SessionPipelineState | null> {
  return readJsonBlob<SessionPipelineState>(sessionStatePath(id));
}

export async function putSessionPipelineState(
  state: SessionPipelineState,
): Promise<void> {
  const path = sessionStatePath(state.sessionId);
  await put(path, JSON.stringify(state), {
    access: 'private',
    contentType: 'application/json',
    allowOverwrite: true,
  });
}

export async function saveLearningSession(
  session: LearningSession,
): Promise<string> {
  const sessionPath = `learnings/${session.id}/session.json`;

  const { url } = await put(sessionPath, JSON.stringify(session), {
    access: 'private',
    contentType: 'application/json',
    allowOverwrite: true,
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

  await updateIndex((current) => {
    const without = current.filter((m) => m.id !== meta.id);
    return [...without, meta];
  });
  return url;
}

export async function getLearningSession(
  id: string,
): Promise<LearningSession | null> {
  const sessionPath = `learnings/${id}/session.json`;
  return readJsonBlob<LearningSession>(sessionPath);
}

export async function listLearningSessions(): Promise<LearningMeta[]> {
  const data = await readJsonBlob<LearningMeta[]>(INDEX_PATH);
  return data ?? [];
}

export async function deleteLearningSession(id: string): Promise<void> {
  const sessionPath = `learnings/${id}/session.json`;
  try {
    await del(sessionPath);
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
    access: 'private',
    contentType: 'application/json',
    allowOverwrite: true,
  });
}
