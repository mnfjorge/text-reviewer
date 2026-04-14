'use client';

import ReactMarkdown from 'react-markdown';

interface MarkdownBodyProps {
  markdown: string;
  className?: string;
}

/**
 * Renders GitHub-flavored-style Markdown with Tailwind Typography (`prose`).
 */
export function MarkdownBody({ markdown, className = '' }: MarkdownBodyProps) {
  return (
    <article
      className={`prose prose-sm prose-slate max-w-none prose-headings:scroll-mt-4 prose-pre:rounded-lg prose-pre:text-xs ${className}`}
    >
      <ReactMarkdown>{markdown}</ReactMarkdown>
    </article>
  );
}
