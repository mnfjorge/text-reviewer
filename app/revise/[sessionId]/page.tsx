'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import type { LearningSession } from '@/lib/types';

type RevisionState = 'idle' | 'loading' | 'streaming' | 'done' | 'error';

export default function ReviseSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const [session, setSession] = useState<LearningSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [patternsOpen, setPatternsOpen] = useState(false);

  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [revisionState, setRevisionState] = useState<RevisionState>('idle');
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // Load the learning session
  useEffect(() => {
    fetch(`/api/learnings/${sessionId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Session not found');
        return res.json() as Promise<LearningSession>;
      })
      .then(setSession)
      .catch((err: unknown) =>
        setSessionError(err instanceof Error ? err.message : 'Failed to load session'),
      )
      .finally(() => setSessionLoading(false));
  }, [sessionId]);

  // Auto-scroll output as text streams in
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [outputText]);

  async function handleRevise() {
    if (!inputText.trim() || revisionState === 'streaming') return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setOutputText('');
    setRevisionError(null);
    setRevisionState('loading');

    try {
      const res = await fetch(`/api/revise/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error((err as { error?: string }).error ?? 'Request failed');
      }

      if (!res.body) throw new Error('No response body');

      setRevisionState('streaming');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        setOutputText((prev) => prev + decoder.decode(value, { stream: true }));
      }

      setRevisionState('done');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') return;
      setRevisionError(err instanceof Error ? err.message : 'Revision failed');
      setRevisionState('error');
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(outputText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleStop() {
    abortRef.current?.abort();
    setRevisionState('done');
  }

  const canRevise =
    inputText.trim().length > 0 &&
    revisionState !== 'streaming' &&
    revisionState !== 'loading';

  // ---------- Loading / error states ----------

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (sessionError || !session) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 mb-4">{sessionError ?? 'Session not found'}</p>
        <Link href="/revise" className="text-indigo-600 hover:underline text-sm">
          ← Back to sessions
        </Link>
      </div>
    );
  }

  // ---------- Main UI ----------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/revise" className="hover:text-gray-700 transition-colors">
              Revise
            </Link>
            <span>/</span>
            <span className="text-gray-700">{session.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{session.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {session.fileA.name} → {session.fileB.name} &middot;{' '}
            {session.chunkCount} chunks analyzed
          </p>
        </div>
      </div>

      {/* Learned patterns (collapsible) */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => setPatternsOpen((o) => !o)}
          className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-800 text-sm">
              Learned patterns
            </span>
            <Badge
              label={String(session.globalPatterns?.length ?? 0)}
              color="indigo"
            />
            {session.rulesMarkdown?.trim() && (
              <Badge label="MD rules" color="gray" />
            )}
          </div>
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${patternsOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {patternsOpen && (
          <div className="border-t border-gray-100 divide-y divide-gray-50">
            {session.rulesMarkdown?.trim() && (
              <div className="px-5 py-4 bg-slate-50/80">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Markdown rules (used first for revision)
                </p>
                <pre className="text-xs text-slate-800 whitespace-pre-wrap break-words font-mono max-h-48 overflow-y-auto">
                  {session.rulesMarkdown}
                </pre>
              </div>
            )}
            {(session.globalPatterns ?? []).map((p, i) => (
              <div key={i} className="px-5 py-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-semibold text-indigo-700">
                    {p.patternType}
                  </span>
                  <Badge label={`${p.exampleCount}×`} color="gray" />
                </div>
                <p className="text-xs text-gray-500 mb-2">{p.description}</p>
                {p.examples.slice(0, 2).map((ex, j) => (
                  <div
                    key={j}
                    className="mt-1 text-xs grid grid-cols-2 gap-2 font-mono"
                  >
                    <div className="bg-red-50 border border-red-100 rounded px-2 py-1 text-red-700 truncate">
                      {ex.source}
                    </div>
                    <div className="bg-green-50 border border-green-100 rounded px-2 py-1 text-green-700 truncate">
                      {ex.target}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input / Output */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Input */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">Input text</label>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Paste or type the text you want to revise…"
            rows={14}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono leading-relaxed"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {inputText.trim().split(/\s+/).filter(Boolean).length} words
            </span>
            <div className="flex gap-2">
              {(revisionState === 'streaming' || revisionState === 'loading') && (
                <Button variant="secondary" size="sm" onClick={handleStop}>
                  Stop
                </Button>
              )}
              <Button
                size="sm"
                onClick={handleRevise}
                disabled={!canRevise}
              >
                {revisionState === 'loading' ? (
                  <>
                    <Spinner size="sm" />
                    <span className="ml-2">Connecting…</span>
                  </>
                ) : revisionState === 'streaming' ? (
                  <>
                    <Spinner size="sm" />
                    <span className="ml-2">Revising…</span>
                  </>
                ) : (
                  'Revise'
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Output */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Revised text</label>
            {outputText && (
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs text-indigo-600 hover:underline"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
          </div>
          <div
            ref={outputRef}
            className={`flex-1 min-h-[14rem] rounded-xl border px-4 py-3 text-sm leading-relaxed font-mono overflow-y-auto whitespace-pre-wrap ${
              outputText
                ? 'border-gray-200 bg-white text-gray-800'
                : 'border-dashed border-gray-200 bg-gray-50 text-gray-400'
            }`}
          >
            {outputText || (
              <span className="italic">
                {revisionState === 'idle'
                  ? 'Revised text will appear here…'
                  : revisionState === 'loading'
                    ? 'Starting revision…'
                    : ''}
              </span>
            )}
            {revisionState === 'streaming' && (
              <span className="inline-block w-1.5 h-4 bg-indigo-500 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
          {revisionState === 'done' && outputText && (
            <span className="text-xs text-gray-400 text-right">
              {outputText.trim().split(/\s+/).filter(Boolean).length} words
            </span>
          )}
          {revisionState === 'error' && revisionError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {revisionError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
