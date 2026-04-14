'use client';

import { useState } from 'react';
import type { ChunkPair, ChunkAnalysis } from '@/lib/types';

interface ChunkPairCardProps {
  pair: ChunkPair;
  analysis: ChunkAnalysis;
}

function insightPreview(insights: ChunkAnalysis['insights']): string {
  if (insights.length === 0) return 'Sem observações';
  const t = insights[0].insight;
  return t.length > 72 ? `${t.slice(0, 69)}…` : t;
}

export function ChunkPairCard({ pair, analysis }: ChunkPairCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-semibold text-gray-500 shrink-0">
            Trecho {pair.index + 1}
          </span>
          <span className="text-xs text-gray-600 truncate" title={insightPreview(analysis.insights)}>
            {insightPreview(analysis.insights)}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-gray-400">
            {analysis.insights.length}{' '}
            {analysis.insights.length === 1 ? 'observação' : 'observações'}
          </span>
          <span className="text-gray-400 text-sm">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100">
          <div className="grid grid-cols-2 gap-px bg-gray-100">
            <div className="bg-white p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Fonte
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {pair.source.text}
              </p>
            </div>
            <div className="bg-white p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Meta
              </p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {pair.target.text}
              </p>
            </div>
          </div>

          {analysis.insights.length > 0 && (
            <div className="p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Observações
              </p>
              {analysis.insights.map((row, i) => (
                <div key={i} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-sm text-gray-800 leading-relaxed">{row.insight}</p>
                  {row.basis && (
                    <p className="text-xs text-gray-500 mt-2 italic border-t border-gray-200/80 pt-2">
                      {row.basis}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
