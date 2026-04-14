'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import type {
  AnalyzeRequest,
  AnalyzeStreamEvent,
  ChunkAnalysis,
  GlobalPattern,
  ParseResponse,
  SessionPipelineState,
} from '@/lib/types';

const changeTypeColor: Record<
  string,
  'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'orange'
> = {
  addition: 'green',
  deletion: 'red',
  substitution: 'yellow',
  reorder: 'blue',
  style: 'purple',
  tone: 'orange',
};

type Status = 'idle' | 'uploading' | 'parsing' | 'analyzing' | 'done' | 'error';

const ACCEPTED = '.pdf,.doc,.docx,.txt';
const MAX_MB = 100;
const MAX_BYTES = MAX_MB * 1024 * 1024;

/** Safe JSON extraction — handles platform-level text error responses (e.g. FUNCTION_PAYLOAD_TOO_LARGE) */
async function safeJson<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const text = await res.text();
    throw new Error(text.trim() || `HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!res.ok)
    throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function safeBlobSegment(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 180);
}

function SessionSourceDownloadLink({
  sessionId,
  side,
  file,
}: {
  sessionId: string;
  side: 'a' | 'b';
  file: { name: string; sourceUrl?: string };
}) {
  if (!file.sourceUrl) {
    return <span className="font-medium">{file.name}</span>;
  }
  return (
    <a
      href={`/api/session/${sessionId}/file?side=${side}`}
      className="font-medium text-indigo-700 underline decoration-indigo-400/70 underline-offset-2 hover:text-indigo-900"
      download={file.name}
    >
      {file.name}
    </a>
  );
}

function DropZone({
  label,
  file,
  uploadPct,
  onFile,
}: {
  label: string;
  file: File | null;
  uploadPct: number | null;
  onFile: (f: File) => void;
}) {
  const [dragging, setDragging] = useState(false);

  const handleFile = useCallback(
    (f: File) => {
      if (f.size > MAX_BYTES) {
        alert(
          `File is too large (${formatBytes(f.size)}). Maximum size is ${MAX_MB} MB.`,
        );
        return;
      }
      onFile(f);
    },
    [onFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        dragging
          ? 'border-indigo-500 bg-indigo-50'
          : file
            ? 'border-green-400 bg-green-50'
            : 'border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50/30'
      }`}
    >
      <input
        type="file"
        accept={ACCEPTED}
        className="absolute inset-0 cursor-pointer opacity-0"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />
      {file ? (
        <>
          <div className="mb-2 text-2xl">📄</div>
          <p className="text-sm font-medium text-gray-800 break-all">
            {file.name}
          </p>
          <p className="mt-1 text-xs text-gray-500">{formatBytes(file.size)}</p>
          {uploadPct !== null && uploadPct < 100 ? (
            <div className="mt-3 w-full">
              <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all duration-200"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-indigo-600">
                {uploadPct}% uploaded
              </p>
            </div>
          ) : uploadPct === 100 ? (
            <p className="mt-2 text-xs text-green-600">Uploaded</p>
          ) : (
            <p className="mt-2 text-xs text-indigo-600">
              Click or drop to replace
            </p>
          )}
        </>
      ) : (
        <>
          <div className="mb-2 text-2xl">📁</div>
          <p className="text-sm font-semibold text-gray-700">{label}</p>
          <p className="mt-1 text-xs text-gray-500">
            PDF, DOCX, DOC, or TXT · max {MAX_MB} MB
          </p>
          <p className="mt-3 text-xs text-indigo-600">Click or drag & drop</p>
        </>
      )}
    </div>
  );
}

export function FileUploader({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [uploadPctA, setUploadPctA] = useState<number | null>(null);
  const [uploadPctB, setUploadPctB] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [streamingAnalyses, setStreamingAnalyses] = useState<ChunkAnalysis[]>(
    [],
  );
  const [streamingSynthesis, setStreamingSynthesis] = useState<
    GlobalPattern[] | null
  >(null);
  const [pipelineHydrated, setPipelineHydrated] = useState(false);
  const [savedPipeline, setSavedPipeline] =
    useState<SessionPipelineState | null>(null);
  const submitInFlight = useRef(false);
  const resumeStarted = useRef(false);

  const readAnalyzeStream = useCallback(
    async (analyzeRes: Response) => {
      if (!analyzeRes.ok || !analyzeRes.body) {
        const text = await analyzeRes.text().catch(() => '');
        throw new Error(text || 'Analysis request failed');
      }

      const reader = analyzeRes.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (!json) continue;

          const event: AnalyzeStreamEvent = JSON.parse(json);

          if (event.type === 'chunk_complete') {
            setProgress((p) => ({ ...p, current: event.chunkIndex + 1 }));
            setStreamingAnalyses((prev) => [...prev, event.analysis]);
          } else if (event.type === 'synthesis') {
            setStreamingSynthesis(event.globalPatterns);
          } else if (event.type === 'saved') {
            setStatus('done');
            router.push(`/review/${event.learningId}`);
            return;
          } else if (event.type === 'error') {
            throw new Error(event.message);
          }
        }
      }
    },
    [router],
  );

  const runAnalyze = useCallback(
    async (parsed: ParseResponse, existing: ChunkAnalysis[] = []) => {
      setStatus('analyzing');
      setProgress({
        current: existing.length,
        total: parsed.pairs.length,
      });
      setStreamingAnalyses([...existing]);
      setStreamingSynthesis(null);

      const analyzeBody: AnalyzeRequest = {
        sessionId: parsed.sessionId,
        pairs: parsed.pairs,
        fileA: { name: parsed.fileA.name, size: parsed.fileA.size },
        fileB: { name: parsed.fileB.name, size: parsed.fileB.size },
        existingAnalyses: existing.length ? existing : undefined,
      };

      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analyzeBody),
      });

      await readAnalyzeStream(analyzeRes);
    },
    [readAnalyzeStream],
  );

  useEffect(() => {
    let cancelled = false;
    resumeStarted.current = false;

    (async () => {
      try {
        const res = await fetch(`/api/session/${sessionId}`);
        if (!res.ok || cancelled) {
          setPipelineHydrated(true);
          return;
        }
        const raw: unknown = await res.json();
        if (raw === null || cancelled) {
          setPipelineHydrated(true);
          return;
        }
        if (
          raw &&
          typeof raw === 'object' &&
          'error' in raw &&
          (raw as { error?: string }).error
        ) {
          setPipelineHydrated(true);
          return;
        }

        const data = raw as SessionPipelineState;

        if (data.stage === 'completed') {
          router.replace(`/review/${sessionId}`);
          return;
        }

        if (data.stage === 'synthesized') {
          const persist = await fetch(`/api/session/${sessionId}/persist`, {
            method: 'POST',
          });
          if (persist.ok && !cancelled) {
            router.replace(`/review/${sessionId}`);
            return;
          }
        }

        setSavedPipeline(data);

        if (data.analyses?.length) {
          setStreamingAnalyses(data.analyses);
        }
        if (data.globalPatterns?.length) {
          setStreamingSynthesis(data.globalPatterns);
        }
        if (data.pairs?.length) {
          setProgress({
            current: data.analyses?.length ?? 0,
            total: data.pairs.length,
          });
        }

        // Session snapshot is applied; show UI before any long-running resume analyze.
        setPipelineHydrated(true);

        const pairsLen = data.pairs?.length ?? 0;
        const done = data.analyses?.length ?? 0;
        if (
          data.stage === 'analyzing' &&
          pairsLen > 0 &&
          done > 0 &&
          done < pairsLen
        ) {
          resumeStarted.current = true;
          if (submitInFlight.current) {
            setPipelineHydrated(true);
            return;
          }
          submitInFlight.current = true;
          setError(null);
          try {
            const n = pairsLen;
            const parsed: ParseResponse = {
              sessionId,
              fileA: {
                name: data.fileA!.name,
                size: data.fileA!.size,
                chunkCount: n,
              },
              fileB: {
                name: data.fileB!.name,
                size: data.fileB!.size,
                chunkCount: n,
              },
              pairs: data.pairs!,
            };
            await runAnalyze(parsed, data.analyses ?? []);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Resume failed');
            setStatus('error');
          } finally {
            submitInFlight.current = false;
          }
        }
      } catch {
        // ignore hydrate errors; user can still upload
      } finally {
        if (!cancelled) setPipelineHydrated(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, router, runAnalyze]);

  const hasLocalPair = fileA !== null && fileB !== null;
  const savedReadyForAnalyze =
    !!savedPipeline?.pairs?.length &&
    !!savedPipeline.fileA &&
    !!savedPipeline.fileB &&
    (savedPipeline.stage === 'parsed' ||
      (savedPipeline.stage === 'analyzing' &&
        (savedPipeline.analyses?.length ?? 0) < savedPipeline.pairs!.length));

  const canSubmit =
    pipelineHydrated &&
    (status === 'idle' || status === 'error') &&
    (hasLocalPair || savedReadyForAnalyze);

  async function handleSubmit() {
    if (!hasLocalPair && !savedReadyForAnalyze) return;
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    setError(null);
    if (!resumeStarted.current) {
      setStreamingAnalyses([]);
      setStreamingSynthesis(null);
    }
    setUploadPctA(0);
    setUploadPctB(0);

    try {
      let parsed: ParseResponse;

      if (hasLocalPair) {
        setStatus('uploading');

        const prefix = `sessions/${sessionId}`;
        const [blobA, blobB] = await Promise.all([
          upload(`${prefix}/file_a_${safeBlobSegment(fileA!.name)}`, fileA!, {
            access: 'private',
            handleUploadUrl: '/api/upload',
            onUploadProgress: ({ percentage }) =>
              setUploadPctA(Math.round(percentage)),
          }),
          upload(`${prefix}/file_b_${safeBlobSegment(fileB!.name)}`, fileB!, {
            access: 'private',
            handleUploadUrl: '/api/upload',
            onUploadProgress: ({ percentage }) =>
              setUploadPctB(Math.round(percentage)),
          }),
        ]);

        setStatus('parsing');

        const parseRes = await fetch('/api/parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            fileA: { url: blobA.url, name: fileA!.name, size: fileA!.size },
            fileB: { url: blobB.url, name: fileB!.name, size: fileB!.size },
          }),
        });

        parsed = await safeJson<ParseResponse>(parseRes);
      } else if (savedReadyForAnalyze) {
        const n = savedPipeline!.pairs!.length;
        parsed = {
          sessionId,
          fileA: {
            name: savedPipeline!.fileA!.name,
            size: savedPipeline!.fileA!.size,
            chunkCount: n,
          },
          fileB: {
            name: savedPipeline!.fileB!.name,
            size: savedPipeline!.fileB!.size,
            chunkCount: n,
          },
          pairs: savedPipeline!.pairs!,
        };
        const existingFromSaved =
          savedPipeline!.stage === 'analyzing'
            ? (savedPipeline!.analyses ?? [])
            : [];
        await runAnalyze(parsed, existingFromSaved);
        return;
      } else {
        throw new Error('Nothing to analyze');
      }

      await runAnalyze(parsed, []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStatus('error');
    } finally {
      submitInFlight.current = false;
    }
  }

  const statusLabel: Record<Status, string> = {
    idle: 'Analyze documents',
    uploading: 'Uploading…',
    parsing: 'Parsing files…',
    analyzing: 'Analyzing…',
    done: 'Done!',
    error: 'Try again',
  };

  if (!pipelineHydrated) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Spinner size="lg" />
        <p className="text-sm text-gray-500">Loading session…</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto">
      {!!savedPipeline?.pairs?.length && !hasLocalPair && (
        <div className="mb-4 rounded-lg border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-sm text-indigo-900">
          <p className="font-medium">Restored from this session</p>
          <p className="mt-1 text-indigo-800/90">
            <SessionSourceDownloadLink
              sessionId={sessionId}
              side="a"
              file={savedPipeline!.fileA!}
            />
            {' · '}
            <SessionSourceDownloadLink
              sessionId={sessionId}
              side="b"
              file={savedPipeline!.fileB!}
            />
            {' · '}
            {savedPipeline!.pairs!.length} aligned chunk pairs
          </p>
          <p className="mt-2 text-xs text-indigo-700/80">
            Upload two new files to replace, or continue with Analyze below.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DropZone
          label="File A — Original"
          file={fileA}
          uploadPct={uploadPctA}
          onFile={(f) => {
            setFileA(f);
            setUploadPctA(null);
          }}
        />
        <DropZone
          label="File B — Reviewed / Translated"
          file={fileB}
          uploadPct={uploadPctB}
          onFile={(f) => {
            setFileB(f);
            setUploadPctB(null);
          }}
        />
      </div>

      {status === 'analyzing' && progress.total > 0 && (
        <div className="mt-6">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Analyzing chunks…</span>
            <span>
              {progress.current} / {progress.total}
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {(streamingAnalyses.length > 0 || streamingSynthesis) && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-800">
              AI output (streaming)
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Chunk analyses and synthesis as they arrive from the model.
            </p>
          </div>
          <div className="max-h-[min(70vh,32rem)] overflow-y-auto p-4 space-y-4">
            {streamingAnalyses.map((analysis, i) => (
              <div
                key={`${analysis.chunkIndex}-${i}`}
                className="rounded-lg border border-gray-100 bg-gray-50/80 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <span className="text-sm font-semibold text-gray-700">
                    Chunk {analysis.chunkIndex + 1}
                  </span>
                  <span className="text-xs text-gray-500">
                    confidence {(analysis.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                {analysis.patterns.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {analysis.patterns.map((p) => (
                      <Badge key={p} label={p} color="indigo" />
                    ))}
                  </div>
                )}
                {analysis.changes.length > 0 && (
                  <div className="space-y-2 mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Changes
                    </p>
                    {analysis.changes.map((change, j) => (
                      <div
                        key={j}
                        className="rounded border border-gray-200 bg-white p-2 text-xs"
                      >
                        <Badge
                          label={change.type}
                          color={changeTypeColor[change.type] ?? 'gray'}
                        />
                        <p className="text-gray-600 mt-1">
                          {change.explanation}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {analysis.rawResponse.trim() && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">
                      Raw model output
                    </p>
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap break-words font-mono bg-white border border-gray-200 rounded p-3 max-h-48 overflow-y-auto">
                      {analysis.rawResponse}
                    </pre>
                  </div>
                )}
              </div>
            ))}

            {streamingSynthesis && streamingSynthesis.length > 0 && (
              <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
                <p className="text-sm font-semibold text-indigo-900 mb-3">
                  Cross-chunk synthesis
                </p>
                <ul className="space-y-3">
                  {streamingSynthesis.map((gp, i) => (
                    <li key={i} className="text-sm text-gray-800">
                      <span className="font-medium text-indigo-800">
                        {gp.patternType}
                      </span>
                      <p className="text-gray-700 mt-1">{gp.description}</p>
                      {gp.examples.length > 0 && (
                        <ul className="mt-2 space-y-1 text-xs text-gray-600 list-disc pl-4">
                          {gp.examples.slice(0, 3).map((ex, j) => (
                            <li key={j}>
                              <span className="text-red-700">{ex.source}</span>
                              {' → '}
                              <span className="text-green-700">
                                {ex.target}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 flex items-center gap-3">
        <Button onClick={handleSubmit} disabled={!canSubmit}>
          {(status === 'uploading' ||
            status === 'parsing' ||
            status === 'analyzing') && <Spinner size="sm" />}
          <span className="ml-2">{statusLabel[status]}</span>
        </Button>
        {status === 'error' && (
          <button
            type="button"
            className="text-sm text-gray-500 hover:text-gray-700"
            onClick={() => {
              setStatus('idle');
              setUploadPctA(null);
              setUploadPctB(null);
              setStreamingAnalyses([]);
              setStreamingSynthesis(null);
            }}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
