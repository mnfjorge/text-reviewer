import type { LearningSession, SessionPipelineState } from './types';

export function learningSessionFromPipeline(
  state: SessionPipelineState,
  blobUrl: string,
): LearningSession | null {
  if (!state.pairs?.length || !state.analyses?.length) {
    return null;
  }
  if (typeof state.rulesMarkdown !== 'string' || !state.rulesMarkdown.trim()) {
    return null;
  }

  return {
    id: state.sessionId,
    createdAt: state.createdAt ?? new Date().toISOString(),
    name:
      state.name ??
      `${state.fileA?.name ?? 'Arquivo A'} e ${state.fileB?.name ?? 'Arquivo B'}`,
    fileA: {
      name: state.fileA?.name ?? 'Arquivo A',
      size: state.fileA?.size ?? 0,
    },
    fileB: {
      name: state.fileB?.name ?? 'Arquivo B',
      size: state.fileB?.size ?? 0,
    },
    chunkCount: state.pairs.length,
    pairs: state.pairs,
    analyses: state.analyses,
    rulesMarkdown: state.rulesMarkdown.trim(),
    blobUrl,
  };
}
