'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ChunkPairCard } from '@/components/ChunkPairCard';
import { MarkdownBody } from '@/components/MarkdownBody';
import { Spinner } from '@/components/ui/Spinner';
import type { LearningSession } from '@/lib/types';

export default function ReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<LearningSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/learnings/${sessionId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Session not found');
        return res.json() as Promise<LearningSession>;
      })
      .then(setSession)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="text-center py-20">
        <p className="text-red-600 mb-4">{error ?? 'Session not found'}</p>
        <Link href="/" className="text-indigo-600 hover:underline text-sm">
          ← Back to upload
        </Link>
      </div>
    );
  }

  const date = new Date(session.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <Link href="/" className="text-sm text-indigo-600 hover:underline">
          ← New analysis
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-gray-900">{session.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-4 text-sm text-gray-500">
          <span>{date}</span>
          <span>{session.chunkCount} chunks</span>
          <span>{session.fileA.name} vs {session.fileB.name}</span>
        </div>
      </div>

      {session.rulesMarkdown?.trim() && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">
            Synthesized rules
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Derived from all chunk insights. Copy or reuse as instructions for another LLM.
          </p>
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="max-h-[min(75vh,40rem)] overflow-y-auto">
              <MarkdownBody markdown={session.rulesMarkdown} />
            </div>
          </div>
        </section>
      )}

      {/* Chunk-by-chunk analysis */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Chunk Analysis
        </h2>
        <div className="space-y-3">
          {session.analyses.map((analysis) => {
            const pair = session.pairs[analysis.chunkIndex] ?? {
              index: analysis.chunkIndex,
              source: { index: analysis.chunkIndex, text: '', wordCount: 0 },
              target: { index: analysis.chunkIndex, text: '', wordCount: 0 },
            };
            return (
              <ChunkPairCard key={analysis.chunkIndex} pair={pair} analysis={analysis} />
            );
          })}
        </div>
        <p className="mt-3 text-xs text-gray-400 text-center">
          Expand each chunk to see source/target text and model insights
        </p>
      </section>
    </div>
  );
}
