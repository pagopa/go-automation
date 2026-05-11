/**
 * RFC 822 / EML email text extractor backed by `mailparser`.
 *
 * Extracts a plain-text representation of the email composed of:
 *  - From / To / Subject / Date headers
 *  - Plain-text body (with HTML→text fallback when only HTML is present)
 *  - Names of any attachments (the attachments themselves are NOT recursively
 *    parsed here; that responsibility belongs to the caller if needed).
 */
import * as fs from 'node:fs/promises';

import { load } from 'cheerio';

import { GOTextExtractionError } from '../GOTextExtractionError.js';
import type { GOTextExtractionOptions } from '../GOTextExtractionOptions.js';
import type { GOTextExtractionResult } from '../GOTextExtractionResult.js';
import type { GOTextExtractor } from '../GOTextExtractor.js';

import { truncateText } from './truncateText.js';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

const SUPPORTED_MIME_TYPES: ReadonlySet<string> = new Set(['message/rfc822']);
const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set(['.eml', '.msg']);

export class GOEmailTextExtractor implements GOTextExtractor {
  public readonly supportedMimeTypes: ReadonlySet<string> = SUPPORTED_MIME_TYPES;
  public readonly supportedExtensions: ReadonlySet<string> = SUPPORTED_EXTENSIONS;

  public async extract(filePath: string, options?: GOTextExtractionOptions): Promise<GOTextExtractionResult> {
    const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch (error) {
      throw new GOTextExtractionError(`Failed to read EML file: ${filePath}`, filePath, 'message/rfc822', error);
    }

    try {
      const { simpleParser } = await import('mailparser');
      const parsed = await simpleParser(buffer);

      const lines: string[] = [];
      if (parsed.from?.text !== undefined) lines.push(`From: ${parsed.from.text}`);
      if (parsed.to !== undefined) {
        const toText = Array.isArray(parsed.to) ? parsed.to.map((entry) => entry.text).join(', ') : parsed.to.text;
        lines.push(`To: ${toText}`);
      }
      if (parsed.cc !== undefined) {
        const ccText = Array.isArray(parsed.cc) ? parsed.cc.map((entry) => entry.text).join(', ') : parsed.cc.text;
        lines.push(`Cc: ${ccText}`);
      }
      if (typeof parsed.subject === 'string') lines.push(`Subject: ${parsed.subject}`);
      if (parsed.date instanceof Date) lines.push(`Date: ${parsed.date.toISOString()}`);
      if (lines.length > 0) lines.push('');

      if (typeof parsed.text === 'string' && parsed.text.length > 0) {
        lines.push(parsed.text);
      } else if (typeof parsed.html === 'string' && parsed.html.length > 0) {
        lines.push(stripHtml(parsed.html));
      }

      if (Array.isArray(parsed.attachments) && parsed.attachments.length > 0) {
        lines.push('');
        lines.push('--- Attachments ---');
        for (const attachment of parsed.attachments) {
          const name = typeof attachment.filename === 'string' ? attachment.filename : '(unnamed)';
          const ct = typeof attachment.contentType === 'string' ? attachment.contentType : 'unknown';
          const size = typeof attachment.size === 'number' ? `${attachment.size}B` : '';
          lines.push(`- ${name} [${ct}] ${size}`.trim());
        }
      }

      const merged = lines.join('\n');
      const { text, truncated } = truncateText(merged, maxBytes);
      return { text, pages: undefined, truncated };
    } catch (error) {
      throw new GOTextExtractionError(`Failed to parse EML: ${filePath}`, filePath, 'message/rfc822', error);
    }
  }
}

/**
 * Minimal HTML → plain-text conversion: drops script/style content, turns
 * `<br>` into a newline, expands `</p>` into a double newline and returns the
 * decoded text content. Good enough for indexing — not for faithful rendering.
 *
 * Uses `cheerio` (a real HTML parser) rather than hand-rolled regexes; this
 * avoids the well-known pitfalls of regex-based HTML sanitization that CodeQL
 * flags (incomplete multi-character sanitization, double escaping, missing
 * matches for `</script >` with whitespace, etc.). Entity decoding (`&amp;`,
 * `&lt;`, `&nbsp;`, …) is done by the parser itself.
 */
function stripHtml(html: string): string {
  const $ = load(html);
  $('script, style').remove();
  $('br').replaceWith('\n');
  $('p').each((_index, element) => {
    $(element).append('\n\n');
  });
  return $.root()
    .text()
    .replace(/\u00a0/g, ' ') // non-breaking space → regular space
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
