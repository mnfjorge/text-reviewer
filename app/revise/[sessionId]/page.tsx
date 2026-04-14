'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { MarkdownBody } from '@/components/MarkdownBody';
import type { LearningSession } from '@/lib/types';
import type { ConversationMessage } from '@/lib/revise';

type RevisionState = 'idle' | 'loading' | 'streaming' | 'done' | 'error';

export default function ReviseSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const [session, setSession] = useState<LearningSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);

  const [patternsOpen, setPatternsOpen] = useState(false);

  // Revision state
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [revisionState, setRevisionState] = useState<RevisionState>('idle');
  const [revisionError, setRevisionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Feedback state
  const [feedback, setFeedback] = useState('');
  const [feedbackRound, setFeedbackRound] = useState(0);

  const abortRef = useRef<AbortController | null>(null);
  const outputRef = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLTextAreaElement>(null);

  // Load the learning session
  useEffect(() => {
    fetch(`/api/learnings/${sessionId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Sessão não encontrada');
        return res.json() as Promise<LearningSession>;
      })
      .then(setSession)
      .catch((err: unknown) =>
        setSessionError(
          err instanceof Error ? err.message : 'Não foi possível carregar a sessão',
        ),
      )
      .finally(() => setSessionLoading(false));
  }, [sessionId]);

  // Auto-scroll output while streaming
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [outputText]);

  // Focus the feedback textarea when a revision completes
  useEffect(() => {
    if (revisionState === 'done' && outputText) {
      setTimeout(() => feedbackRef.current?.focus(), 50);
    }
  }, [revisionState, outputText]);

  /**
   * Shared streaming runner. Sends `msgs` to the API, streams the response
   * into outputText, then commits the assistant reply to the messages history.
   */
  async function runStream(msgs: ConversationMessage[]) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setOutputText('');
    setRevisionError(null);
    setRevisionState('loading');

    let accumulated = '';

    try {
      const res = await fetch(`/api/revise/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: msgs }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Falha na solicitação' }));
        throw new Error((err as { error?: string }).error ?? 'Falha na solicitação');
      }

      if (!res.body) throw new Error('Resposta sem corpo');

      setRevisionState('streaming');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setOutputText((prev) => prev + chunk);
      }

      // Commit the full conversation including the assistant reply
      setMessages([...msgs, { role: 'assistant', content: accumulated }]);
      setRevisionState('done');
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        // Save partial output so feedback can still reference it
        if (accumulated) {
          setMessages([...msgs, { role: 'assistant', content: accumulated }]);
        }
        return;
      }
      setRevisionError(err instanceof Error ? err.message : 'Falha na revisão');
      setRevisionState('error');
    }
  }

  async function handleRevise() {
    if (!inputText.trim() || revisionState === 'streaming' || revisionState === 'loading') return;

    setFeedbackRound(0);
    setFeedback('');

    const msgs: ConversationMessage[] = [
      { role: 'user', content: `Revise o texto a seguir conforme as regras acima:\n\n${inputText.trim()}` },
    ];
    setMessages(msgs);
    await runStream(msgs);
  }

  async function handleFeedback() {
    if (!feedback.trim() || revisionState !== 'done' || !outputText) return;

    const updatedMsgs: ConversationMessage[] = [
      ...messages,
      {
        role: 'user',
        content: `Refine o texto revisado com base neste feedback:\n\n${feedback.trim()}`,
      },
    ];
    setFeedback('');
    setFeedbackRound((r) => r + 1);
    await runStream(updatedMsgs);
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

  const isBusy = revisionState === 'loading' || revisionState === 'streaming';
  const canRevise = inputText.trim().length > 0 && !isBusy;
  const canApplyFeedback = feedback.trim().length > 0 && revisionState === 'done' && outputText.length > 0;

  // ---- Loading / error ----

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
        <p className="text-gray-500 mb-4">{sessionError ?? 'Sessão não encontrada'}</p>
        <Link href="/revise" className="text-indigo-600 hover:underline text-sm">
          ← Voltar às sessões
        </Link>
      </div>
    );
  }

  // ---- Main UI ----

  const showFeedback = (revisionState === 'done' || (isBusy && feedbackRound > 0)) && outputText.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
            <Link href="/revise" className="hover:text-gray-700 transition-colors">
              Revisar
            </Link>
            <span>/</span>
            <span className="text-gray-700">{session.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{session.name}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {session.fileA.name} → {session.fileB.name} &middot;{' '}
            {session.chunkCount} trechos analisados
          </p>
        </div>
      </div>

      {/* Learned rules (collapsible, rendered Markdown — same text used for revision) */}
      {session.rulesMarkdown?.trim() && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <button
            type="button"
            onClick={() => setPatternsOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
          >
            <span className="font-medium text-gray-800 text-sm">
              Regras aprendidas (Markdown)
            </span>
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
            <div className="border-t border-gray-100 px-5 py-4 max-h-[min(60vh,28rem)] overflow-y-auto bg-slate-50/50">
              <MarkdownBody markdown={session.rulesMarkdown} />
            </div>
          )}
        </div>
      )}

      {/* Input / Output */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Input */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-700">Texto de entrada</label>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Cole ou digite o texto que deseja revisar…"
            rows={14}
            className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono leading-relaxed"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {inputText.trim().split(/\s+/).filter(Boolean).length} palavras
            </span>
            <div className="flex gap-2">
              {isBusy && (
                <Button variant="secondary" size="sm" onClick={handleStop}>
                  Parar
                </Button>
              )}
              <Button size="sm" onClick={handleRevise} disabled={!canRevise}>
                {revisionState === 'loading' ? (
                  <>
                    <Spinner size="sm" />
                    <span className="ml-2">Conectando…</span>
                  </>
                ) : revisionState === 'streaming' && feedbackRound === 0 ? (
                  <>
                    <Spinner size="sm" />
                    <span className="ml-2">Revisando…</span>
                  </>
                ) : (
                  'Revisar'
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Output */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Texto revisado</label>
              {feedbackRound > 0 && (
                <Badge label={`refinado ×${feedbackRound}`} color="indigo" />
              )}
            </div>
            {outputText && (
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs text-indigo-600 hover:underline"
              >
                {copied ? 'Copiado!' : 'Copiar'}
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
                  ? 'O texto revisado aparecerá aqui…'
                  : revisionState === 'loading'
                    ? 'Iniciando revisão…'
                    : ''}
              </span>
            )}
            {revisionState === 'streaming' && (
              <span className="inline-block w-1.5 h-4 bg-indigo-500 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
          {revisionState === 'done' && outputText && (
            <span className="text-xs text-gray-400 text-right">
              {outputText.trim().split(/\s+/).filter(Boolean).length} palavras
            </span>
          )}
          {revisionState === 'error' && revisionError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {revisionError}
            </div>
          )}
        </div>
      </div>

      {/* Feedback section — appears after the first revision lands */}
      {showFeedback && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-medium text-gray-800">Refinar com feedback</h2>
            {feedbackRound > 0 && (
              <Badge label={`rodada ${feedbackRound + 1}`} color="gray" />
            )}
          </div>
          <p className="text-xs text-gray-500">
            Descreva o que mudar — o Claude reaplicará as regras aprendidas respeitando
            suas instruções.
          </p>
          <textarea
            ref={feedbackRef}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canApplyFeedback) {
                e.preventDefault();
                handleFeedback();
              }
            }}
            placeholder={
              feedbackRound === 0
                ? 'Ex.: "Mantenha as perguntas retóricas. O segundo parágrafo ainda está muito formal."'
                : 'Ex.: "Bom, mas encurte a última frase e use a voz ativa em todo o texto."'
            }
            rows={3}
            disabled={isBusy}
            className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none disabled:opacity-50"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">⌘ Enter para aplicar</span>
            <Button
              size="sm"
              onClick={handleFeedback}
              disabled={!canApplyFeedback}
            >
              {isBusy && feedbackRound > 0 ? (
                <>
                  <Spinner size="sm" />
                  <span className="ml-2">Refinando…</span>
                </>
              ) : (
                'Aplicar feedback'
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
