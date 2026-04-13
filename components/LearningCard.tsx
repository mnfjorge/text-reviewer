'use client';

import Link from 'next/link';
import { Button } from './ui/Button';
import type { LearningMeta } from '@/lib/types';

interface LearningCardProps {
  meta: LearningMeta;
  onDelete?: (id: string) => void;
}

export function LearningCard({ meta, onDelete }: LearningCardProps) {
  const date = new Date(meta.createdAt).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col gap-3">
      <div>
        <h3 className="font-semibold text-gray-800 text-sm leading-snug">{meta.name}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{date}</p>
      </div>
      <div className="text-xs text-gray-600 space-y-1">
        <div>
          <span className="font-medium text-gray-500">File A: </span>{meta.fileA}
        </div>
        <div>
          <span className="font-medium text-gray-500">File B: </span>{meta.fileB}
        </div>
        <div>
          <span className="font-medium text-gray-500">Chunks: </span>{meta.chunkCount}
        </div>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <Link href={`/review/${meta.id}`} className="flex-1">
          <Button size="sm" variant="secondary" className="w-full">View</Button>
        </Link>
        {onDelete && (
          <Button
            size="sm"
            variant="danger"
            onClick={() => onDelete(meta.id)}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
