/** Paragraph with offsets into normalized full text. */
export interface HeadingCandidate {
  id: number;
  /** Trimmed heading text (for LLM and display). */
  text: string;
  /** Start index in normalized document string. */
  start: number;
  /** End index (exclusive) in normalized document string. */
  end: number;
}

function countWords(s: string): number {
  return s.split(/\s+/).filter((w) => w.length > 0).length;
}

function isLikelyHeading(para: string): boolean {
  const t = para.trim();
  if (t.length === 0 || t.length > 220) return false;
  const words = countWords(t);
  if (words > 28) return false;
  if (/^\d+(\.\d+)*[\s.)]/.test(t)) return true;
  if (/^(chapter|section|part|appendix)\s+\d+/i.test(t)) return true;
  if (words <= 14 && !/\.\s/.test(t) && t.length < 100) return true;
  if (/^[A-Z][A-Z0-9\s\-–—:]{6,}$/u.test(t) && words <= 18) return true;
  return false;
}

/**
 * Collect likely section titles from plain extracted text (PDF/DOCX/TXT).
 * Offsets refer to `normalizedText` (same string used for slicing).
 */
export function extractHeadingCandidates(normalizedText: string): HeadingCandidate[] {
  const text = normalizedText;
  const parts = text.split(/\n\n+/);
  const out: HeadingCandidate[] = [];
  let scanFrom = 0;

  for (const raw of parts) {
    const trimmed = raw.trim();
    if (!trimmed) {
      scanFrom = text.indexOf(raw, scanFrom);
      scanFrom = scanFrom >= 0 ? scanFrom + raw.length : scanFrom;
      continue;
    }
    const start = text.indexOf(trimmed, scanFrom);
    if (start < 0) continue;
    const end = start + trimmed.length;
    scanFrom = end;

    if (!isLikelyHeading(trimmed)) continue;

    out.push({
      id: out.length,
      text: trimmed.length > 180 ? `${trimmed.slice(0, 177)}…` : trimmed,
      start,
      end,
    });
  }

  return out.slice(0, 80).map((h, id) => ({ ...h, id }));
}
