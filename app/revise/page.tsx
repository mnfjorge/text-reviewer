'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Spinner } from '@/components/ui/Spinner';
import type { LearningMeta } from '@/lib/types';

export default function ReviseLandingPage() {
  const [sessions, setSessions] = useState<LearningMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/learnings')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load sessions');
        return res.json() as Promise<LearningMeta[]>;
      })
      .then((data) =>
        setSessions([...data].sort((a, b) => b.createdAt.localeCompare(a.createdAt))),
      )
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : 'Unknown error'),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Revise Text</h1>
        <p className="mt-1 text-sm text-gray-500">
          Pick a learning session — its patterns will be applied to your input text.
        </p>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && sessions.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg mb-2">No learning sessions yet</p>
          <p className="text-sm mb-4">
            Run a document comparison first to build revision patterns.
          </p>
          <Link href="/" className="text-sm text-indigo-600 hover:underline">
            Start a new analysis →
          </Link>
        </div>
      )}

      {!loading && sessions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((meta) => (
            <Link
              key={meta.id}
              href={`/revise/${meta.id}`}
              className="block p-5 rounded-xl border border-gray-200 bg-white hover:border-indigo-400 hover:shadow-sm transition-all group"
            >
              <h3 className="font-semibold text-gray-900 truncate group-hover:text-indigo-700 transition-colors">
                {meta.name}
              </h3>
              <p className="mt-1 text-xs text-gray-500 truncate">
                {meta.fileA} → {meta.fileB}
              </p>
              <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                <span>{meta.chunkCount} chunks</span>
                <span>·</span>
                <span>
                  {new Date(meta.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
              <div className="mt-3 text-xs font-medium text-indigo-600 group-hover:underline">
                Use this session →
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
