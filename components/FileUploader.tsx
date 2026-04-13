'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from './ui/Button';
import { Spinner } from './ui/Spinner';
import type { AnalyzeRequest, AnalyzeStreamEvent, ParseResponse } from '@/lib/types';

type Status = 'idle' | 'parsing' | 'analyzing' | 'done' | 'error';

const ACCEPTED = '.pdf,.doc,.docx,.txt';

function DropZone({
  label,
  file,
  onFile,
}: {
  label: string;
  file: File | null;
  onFile: (f: File) => void;
}) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) onFile(f);
    },
    [onFile],
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
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
      {file ? (
        <>
          <div className="mb-2 text-2xl">📄</div>
          <p className="text-sm font-medium text-gray-800 break-all">{file.name}</p>
          <p className="mt-1 text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
          <p className="mt-2 text-xs text-indigo-600">Click or drop to replace</p>
        </>
      ) : (
        <>
          <div className="mb-2 text-2xl">📁</div>
          <p className="text-sm font-semibold text-gray-700">{label}</p>
          <p className="mt-1 text-xs text-gray-500">PDF, DOCX, DOC, or TXT · max 10 MB</p>
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
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const canSubmit = fileA !== null && fileB !== null && status === 'idle';

  async function handleSubmit() {
    if (!fileA || !fileB) return;
    setStatus('parsing');
    setError(null);

    try {
      // Step 1: parse files
      const form = new FormData();
      form.append('fileA', fileA);
      form.append('fileB', fileB);

      const parseRes = await fetch('/api/parse', { method: 'POST', body: form });
      if (!parseRes.ok) {
        const { error: msg } = await parseRes.json();
        throw new Error(msg ?? 'Parsing failed');
      }
      const parsed: ParseResponse = await parseRes.json();

      // Step 2: analyze with SSE streaming
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
        throw new Error('Analysis request failed');
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

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DropZone label="File A — Original" file={fileA} onFile={setFileA} />
        <DropZone label="File B — Reviewed / Translated" file={fileB} onFile={setFileB} />
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
          {status === 'parsing' && <Spinner size="sm" />}
          {status === 'analyzing' && <Spinner size="sm" />}
          <span className="ml-2">
            {status === 'idle' && 'Analyze documents'}
            {status === 'parsing' && 'Parsing files…'}
            {status === 'analyzing' && 'Analyzing…'}
            {status === 'done' && 'Done!'}
            {status === 'error' && 'Try again'}
          </span>
        </Button>
        {status === 'error' && (
          <button
            className="text-sm text-gray-500 hover:text-gray-700"
            onClick={() => setStatus('idle')}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
