export async function parseTxt(buffer: Buffer): Promise<string> {
  try {
    return buffer.toString('utf-8');
  } catch {
    return buffer.toString('latin1');
  }
}
