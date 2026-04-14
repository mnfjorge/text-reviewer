import { createRequire } from 'node:module';
import { join } from 'node:path';

// Load the inner entry only. Root `pdf-parse/index.js` runs a dev self-test when
// `!module.parent` (reads ./test/data/…), which breaks Next bundles and collectPageData.
const require = createRequire(join(process.cwd(), 'package.json'));
const pdfParse = require('pdf-parse/lib/pdf-parse.js') as (
  dataBuffer: Buffer,
) => Promise<{ text: string }>;

export async function parsePdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text;
}
