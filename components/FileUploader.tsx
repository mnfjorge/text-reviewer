'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { upload } from '@vercel/blob/client';
import { v4 as uuidv4 } from 'uuid';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import type { AnalyzeRequest, AnalyzeStreamEvent, ParseResponse } from '@/lib/types';

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
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
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
        alert(`File is too large (${formatBytes(f.size)}). Maximum size is ${MAX_MB} MB.`);
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
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
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
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
      />
      {file ? (
        <>
          <div className="mb-2 text-2xl">📄</div>
          <p className="text-sm font-medium text-gray-800 break-all">{file.name}</p>
          <p className="mt-1 text-xs text-gray-500">{formatBytes(file.size)}</p>
          {uploadPct !== null && uploadPct < 100 ? (
            <div className="mt-3 w-full">
              <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all duration-200"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-indigo-600">{uploadPct}% uploaded</p>
            </div>
          ) : uploadPct === 100 ? (
            <p className="mt-2 text-xs text-green-600">Uploaded</p>
          ) : (
            <p className="mt-2 text-xs text-indigo-600">Click or drop to replace</p>
          )}
        </>
      ) : (
        <>
          <div className="mb-2 text-2xl">📁</div>
          <p className="text-sm font-semibold text-gray-700">{label}</p>
          <p className="mt-1 text-xs text-gray-500">PDF, DOCX, DOC, or TXT · max {MAX_MB} MB</p>
          <p className="mt-3 text-xs text-indigo-600">Click or drag & drop</p>
        </>
      )}
    </div>
  );
}

export function FileUploader() {
  const router = useRouter();
  const [fileA, setFileA] = useState<File | null>(null);
  const [fileB, setFileB] = useState<File | null>(null);
  const [uploadPctA, setUploadPctA] = useState<number | null>(null);
  const [uploadPctB, setUploadPctB] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const canSubmit = fileA !== null && fileB !== null && status === 'idle';

  async function handleSubmit() {
    if (!fileA || !fileB) return;
    setStatus('uploading');
    setError(null);
    setUploadPctA(0);
    setUploadPctB(0);

    try {
      // Step 1: Upload both files directly to Vercel Blob (bypasses function payload limit)
      const sessionPrefix = `temp/${uuidv4()}`;

      const [blobA, blobB] = await Promise.all([
        upload(`${sessionPrefix}/${fileA.name}`, fileA, {
          access: 'public',
          handleUploadUrl: '/api/upload',
          onUploadProgress: ({ percentage }) => setUploadPctA(Math.round(percentage)),
        }),
        upload(`${sessionPrefix}/${fileB.name}`, fileB, {
          access: 'public',
          handleUploadUrl: '/api/upload',
          onUploadProgress: ({ percentage }) => setUploadPctB(Math.round(percentage)),
        }),
      ]);

      // Step 2: Parse files (server downloads from blob URLs, no payload size limit)
      setStatus('parsing');

      const parseRes = await fetch('/api/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileA: { url: blobA.url, name: fileA.name, size: fileA.size },
          fileB: { url: blobB.url, name: fileB.name, size: fileB.size },
        }),
      });

      const parsed = await safeJson<ParseResponse>(parseRes);

      // Step 3: Analyze with SSE streaming
      setStatus('analyzing');
      setProgress({ current: 0, total: parsed.pairs.length });

      const analyzeBody: AnalyzeRequest = {
        sessionId: parsed.sessionId,
        pairs: parsed.pairs,
        fileA: { name: parsed.fileA.name, size: parsed.fileA.size },
        fileB: { name: parsed.fileB.name, size: parsed.fileB.size },
      };

      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analyzeBody),
      });

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
          } else if (event.type === 'saved') {
            setStatus('done');
            router.push(`/review/${event.learningId}`);
            return;
          } else if (event.type === 'error') {
            throw new Error(event.message);
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStatus('error');
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

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DropZone
          label="File A — Original"
          file={fileA}
          uploadPct={uploadPctA}
          onFile={(f) => { setFileA(f); setUploadPctA(null); }}
        />
        <DropZone
          label="File B — Reviewed / Translated"
          file={fileB}
          uploadPct={uploadPctB}
          onFile={(f) => { setFileB(f); setUploadPctB(null); }}
        />
      </div>

      {status === 'analyzing' && progress.total > 0 && (
        <div className="mt-6">
          <div className="flex justify-between text-sm text-gray-600 mb-1">
            <span>Analyzing chunks…</span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
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
          {(status === 'uploading' || status === 'parsing' || status === 'analyzing') && (
            <Spinner size="sm" />
          )}
          <span className="ml-2">{statusLabel[status]}</span>
        </Button>
        {status === 'error' && (
          <button
            className="text-sm text-gray-500 hover:text-gray-700"
            onClick={() => { setStatus('idle'); setUploadPctA(null); setUploadPctB(null); }}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
