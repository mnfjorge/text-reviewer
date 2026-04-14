import type { LearningSession, SessionPipelineState } from './types';

export function learningSessionFromPipeline(
  state: SessionPipelineState,
  blobUrl: string,
): LearningSession | null {
  if (
    !state.pairs?.length ||
    !state.analyses?.length ||
    state.globalPatterns === undefined
  ) {
    return null;
  }

  return {
    id: state.sessionId,
    createdAt: state.createdAt ?? new Date().toISOString(),
    name:
      state.name ??
      `${state.fileA?.name ?? 'File A'} vs ${state.fileB?.name ?? 'File B'}`,
    fileA: state.fileA ?? { name: 'File A', size: 0 },
    fileB: state.fileB ?? { name: 'File B', size: 0 },
    chunkCount: state.pairs.length,
    pairs: state.pairs,
    analyses: state.analyses,
    globalPatterns: state.globalPatterns,
    blobUrl,
  };
}
