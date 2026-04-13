'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LearningCard } from '@/components/LearningCard';
import { Spinner } from '@/components/ui/Spinner';
import type { LearningMeta } from '@/lib/types';

export default function LearningsPage() {
  const [sessions, setSessions] = useState<LearningMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/learnings')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load learnings');
        return res.json() as Promise<LearningMeta[]>;
      })
      .then(setSessions)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    await fetch(`/api/learnings/${id}`, { method: 'DELETE' });
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Learnings</h1>
          <p className="mt-1 text-sm text-gray-500">
            All stored document comparison sessions
          </p>
        </div>
        <Link
          href="/"
          className="text-sm bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          New analysis
        </Link>
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
          <p className="text-lg mb-2">No learnings yet</p>
          <Link href="/" className="text-sm text-indigo-600 hover:underline">
            Run your first analysis →
          </Link>
        </div>
      )}

      {!loading && sessions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((meta) => (
            <LearningCard key={meta.id} meta={meta} onDelete={handleDelete} />
          ))}
        </div>
      )}
    </div>
  );
}
