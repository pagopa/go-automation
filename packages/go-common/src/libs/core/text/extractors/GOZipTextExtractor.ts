/**
 * ZIP archive text extractor backed by `adm-zip`.
 *
 * For each non-directory entry:
 *  1. If the entry is a UTF-8 text-like format (txt/md/csv/json/xml/etc.),
 *     decode the buffer in-memory and append its content.
 *  2. Otherwise, if a `GOTextExtractorRegistry` was injected and it can handle
 *     the entry (by MIME or extension), the entry is materialised in a
 *     temporary file and re-dispatched through the registry. This makes ZIPs
 *     containing PDF / DOCX / XLSX transparently searchable.
 *  3. Otherwise the entry name is recorded as a header but its content is
 *     skipped.
 *
 * To avoid pathological infinite recursion (zip-bombs, zip-in-zip cycles),
 * the constructor accepts a `maxRecursionDepth` (default 2). The current
 * call stack depth is tracked via the `__zipDepth` symbol on the options
 * object passed through the registry.
 */
import { createRequire } from 'node:module';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

import type AdmZipModule from 'adm-zip';

import { GOTextExtractionError } from '../GOTextExtractionError.js';
import type { GOTextExtractionOptions } from '../GOTextExtractionOptions.js';
import type { GOTextExtractionResult } from '../GOTextExtractionResult.js';
import type { GOTextExtractor } from '../GOTextExtractor.js';
import type { GOTextExtractorRegistry } from '../GOTextExtractorRegistry.js';

import { truncateText } from './truncateText.js';

const requireCjs = createRequire(import.meta.url);

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_RECURSION_DEPTH = 2;

const SUPPORTED_MIME_TYPES: ReadonlySet<string> = new Set(['application/zip', 'application/x-zip-compressed']);
const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set(['.zip']);

const TEXT_LIKE_EXTENSIONS: ReadonlySet<string> = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.tsv',
  '.log',
  '.xml',
  '.json',
  '.jsonl',
  '.ndjson',
  '.html',
  '.htm',
  '.svg',
  '.yml',
  '.yaml',
]);

/**
 * Symbol carried on `GOTextExtractionOptions` to track recursion depth across
 * registry → zip → registry calls.
 */
export const ZIP_DEPTH_SYMBOL: unique symbol = Symbol.for('go-common.zip.depth');

export interface GOZipTextExtractorConfig {
  /**
   * Optional registry used to recursively extract text from binary entries
   * inside the archive. If not provided, only text-like entries are
   * extracted.
   */
  readonly registry?: GOTextExtractorRegistry;

  /**
   * Maximum recursion depth for nested zips. Defaults to 2.
   */
  readonly maxRecursionDepth?: number;
}

export class GOZipTextExtractor implements GOTextExtractor {
  public readonly supportedMimeTypes: ReadonlySet<string> = SUPPORTED_MIME_TYPES;
  public readonly supportedExtensions: ReadonlySet<string> = SUPPORTED_EXTENSIONS;

  private readonly registry: GOTextExtractorRegistry | undefined;
  private readonly maxRecursionDepth: number;

  constructor(config: GOZipTextExtractorConfig = {}) {
    this.registry = config.registry;
    this.maxRecursionDepth = config.maxRecursionDepth ?? DEFAULT_MAX_RECURSION_DEPTH;
  }

  public async extract(filePath: string, options?: GOTextExtractionOptions): Promise<GOTextExtractionResult> {
    const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
    const currentDepth = readDepth(options);
    if (currentDepth > this.maxRecursionDepth) {
      return { text: '', pages: undefined, truncated: false };
    }

    const admZipCtor = requireCjs('adm-zip') as new (path?: string) => AdmZipModule;
    let zip: AdmZipModule;
    try {
      zip = new admZipCtor(filePath);
    } catch (error) {
      throw new GOTextExtractionError(`Failed to open ZIP: ${filePath}`, filePath, 'application/zip', error);
    }

    const lines: string[] = [];
    let tempDir: string | undefined;
    try {
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        const entryName = entry.entryName;
        const entryExt = path.extname(entryName).toLowerCase();

        lines.push(`--- ${entryName} ---`);

        if (TEXT_LIKE_EXTENSIONS.has(entryExt)) {
          const data = entry.getData();
          lines.push(data.toString('utf8'));
          continue;
        }

        if (this.registry === undefined) continue;
        if (!this.registry.canHandle(undefined, entryName)) continue;

        tempDir ??= await fs.mkdtemp(path.join(os.tmpdir(), 'go-zip-'));
        const tempPath = path.join(tempDir, `${randomUUID()}-${path.basename(entryName)}`);
        try {
          const data = entry.getData();

          await fs.writeFile(tempPath, data);
          const innerOptions = withIncreasedDepth(options, currentDepth);
          const result = await this.registry.extract(undefined, tempPath, innerOptions);
          if (result.text.length > 0) lines.push(result.text);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown';
          lines.push(`(failed to parse: ${message})`);
        }
      }
    } finally {
      if (tempDir !== undefined) {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          /* best-effort */
        }
      }
    }

    const merged = lines.join('\n');
    const { text, truncated } = truncateText(merged, maxBytes);
    return { text, pages: undefined, truncated };
  }
}

function readDepth(options: GOTextExtractionOptions | undefined): number {
  if (options === undefined) return 0;
  const value = (options as { [ZIP_DEPTH_SYMBOL]?: number })[ZIP_DEPTH_SYMBOL];
  return typeof value === 'number' ? value : 0;
}

function withIncreasedDepth(
  options: GOTextExtractionOptions | undefined,
  currentDepth: number,
): GOTextExtractionOptions {
  return {
    ...(options ?? {}),
    [ZIP_DEPTH_SYMBOL]: currentDepth + 1,
  } as GOTextExtractionOptions;
}
