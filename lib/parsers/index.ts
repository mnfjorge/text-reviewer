import { parsePdf } from './pdf';
import { parseDocx } from './docx';
import { parseTxt } from './txt';

const SUPPORTED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt'];

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx >= 0 ? filename.slice(idx).toLowerCase() : '';
}

export async function parseFile(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<string> {
  const ext = getExtension(filename);

  if (
    mimeType === 'application/pdf' ||
    ext === '.pdf'
  ) {
    return parsePdf(buffer);
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    ext === '.docx' ||
    ext === '.doc'
  ) {
    return parseDocx(buffer);
  }

  if (
    mimeType === 'text/plain' ||
    ext === '.txt'
  ) {
    return parseTxt(buffer);
  }

  throw new Error(
    `Tipo de arquivo não suportado: ${filename}. Envie PDF, DOCX, DOC ou TXT.`,
  );
}

export function isSupportedFile(filename: string, mimeType: string): boolean {
  const ext = getExtension(filename);
  if (SUPPORTED_EXTENSIONS.includes(ext)) return true;
  const supportedMimes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
  ];
  return supportedMimes.includes(mimeType);
}
