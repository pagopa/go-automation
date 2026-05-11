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
 * Minimal HTML → plain-text conversion: drops all tags, collapses whitespace
 * and decodes the most common entities. Good enough for indexing — not for
 * faithful rendering.
 *
 * The `<script>` / `<style>` block removal is applied iteratively until the
 * input is stable, otherwise a crafted payload like `<scr<script>…</script>ipt>…</script>`
 * would slip through a single pass (CodeQL: incomplete-multi-character-sanitization).
 */
function stripHtml(html: string): string {
  let withoutBlocks = removeUntilStable(html, /<script\b[^>]*>[\s\S]*?<\/script>/gi);
  withoutBlocks = removeUntilStable(withoutBlocks, /<style\b[^>]*>[\s\S]*?<\/style>/gi);
  return withoutBlocks
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Repeatedly applies `pattern.replace(…, '')` until the input stops changing.
 * Required for patterns that can leave residue capable of re-forming a match
 * on a single pass (e.g. nested or interleaved `<script>` tags).
 */
function removeUntilStable(input: string, pattern: RegExp): string {
  let previous: string;
  let current = input;
  do {
    previous = current;
    current = current.replace(pattern, '');
  } while (current !== previous);
  return current;
}
