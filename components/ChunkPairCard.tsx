'use client';

import { useState } from 'react';
import { Badge } from './ui/Badge';
import type { ChunkPair, ChunkAnalysis } from '@/lib/types';

const changeTypeColor: Record<string, 'green' | 'red' | 'yellow' | 'blue' | 'purple' | 'orange'> = {
  addition: 'green',
  deletion: 'red',
  substitution: 'yellow',
  reorder: 'blue',
  style: 'purple',
  tone: 'orange',
};

interface ChunkPairCardProps {
  pair: ChunkPair;
  analysis: ChunkAnalysis;
}

export function ChunkPairCard({ pair, analysis }: ChunkPairCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-500">Chunk {pair.index + 1}</span>
          <div className="flex flex-wrap gap-1">
            {analysis.patterns.slice(0, 3).map((p) => (
              <Badge key={p} label={p} color="indigo" />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {analysis.changes.length} change{analysis.changes.length !== 1 ? 's' : ''}
          </span>
          <span className="text-gray-400 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          {/* Side-by-side text */}
          <div className="grid grid-cols-2 gap-px bg-gray-100">
            <div className="bg-white p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Source</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {pair.source.text}
              </p>
            </div>
            <div className="bg-white p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Target</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {pair.target.text}
              </p>
            </div>
          </div>

          {/* Change items */}
          {analysis.changes.length > 0 && (
            <div className="p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Changes</p>
              {analysis.changes.map((change, i) => (
                <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <div className="flex items-start gap-3">
                    <Badge label={change.type} color={changeTypeColor[change.type] ?? 'gray'} />
                    <div className="flex-1 min-w-0">
                      {change.sourceFragment && (
                        <div className="text-xs mb-1">
                          <span className="text-gray-500">Before: </span>
                          <span className="font-mono bg-red-50 text-red-700 px-1 rounded">
                            {change.sourceFragment}
                          </span>
                        </div>
                      )}
                      {change.targetFragment && (
                        <div className="text-xs mb-1">
                          <span className="text-gray-500">After: </span>
                          <span className="font-mono bg-green-50 text-green-700 px-1 rounded">
                            {change.targetFragment}
                          </span>
                        </div>
                      )}
                      <p className="text-xs text-gray-600 mt-1">{change.explanation}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
