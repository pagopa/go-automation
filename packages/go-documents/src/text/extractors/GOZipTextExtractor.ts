/**
 * ZIP archive text extractor backed by `unzipper-esm`.
 *
 * Archive entries are streamed instead of being materialised in memory:
 *  1. UTF-8 text-like entries (txt/md/csv/json/xml/etc.) are decoded while
 *     they are read and stop as soon as the output budget is exhausted.
 *  2. Entries supported by an injected `GOTextExtractorRegistry` are streamed
 *     to a temporary file and re-dispatched through the registry. This makes
 *     ZIPs containing PDF / DOCX / XLSX transparently searchable.
 *  3. Unsupported entries contribute their name only.
 *
 * Nested archives share entry and decompression budgets. Recursion depth is
 * tracked through the `__zipDepth` symbol carried by the extraction options.
 */
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { Transform, type TransformCallback } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { StringDecoder } from 'node:string_decoder';

import { Open, type File as ZipEntry } from 'unzipper-esm';

import { GOTextExtractionError } from '../GOTextExtractionError.js';
import type { GOTextExtractionOptions } from '../GOTextExtractionOptions.js';
import type { GOTextExtractionResult } from '../GOTextExtractionResult.js';
import type { GOTextExtractor } from '../GOTextExtractor.js';
import type { GOTextExtractorRegistry } from '../GOTextExtractorRegistry.js';

import { truncateText } from './truncateText.js';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_RECURSION_DEPTH = 2;
const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_MAX_ENTRY_BYTES = 512 * 1024 * 1024;
const DEFAULT_MAX_EXPANDED_BYTES = 512 * 1024 * 1024;

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

/** Tracks recursion depth across registry → ZIP → registry calls. */
export const ZIP_DEPTH_SYMBOL: unique symbol = Symbol.for('go-common.zip.depth');

const ZIP_BUDGET_SYMBOL: unique symbol = Symbol.for('go-common.zip.budget');

interface ZipExtractionBudget {
  entries: number;
  expandedBytes: number;
  readonly maxEntries: number;
  readonly maxEntryBytes: number;
  readonly maxExpandedBytes: number;
}

export interface GOZipTextExtractorConfig {
  /**
   * Optional registry used to recursively extract text from binary entries
   * inside the archive. If not provided, only text-like entries are extracted.
   */
  readonly registry?: GOTextExtractorRegistry;

  /** Maximum recursion depth for nested ZIPs. Defaults to 2. */
  readonly maxRecursionDepth?: number;

  /** Maximum number of entries across an archive and its nested ZIPs. Defaults to 10,000. */
  readonly maxEntries?: number;

  /** Maximum decompressed size of a single processed entry. Defaults to 512 MiB. */
  readonly maxEntryBytes?: number;

  /** Maximum total bytes decompressed across an archive and its nested ZIPs. Defaults to 512 MiB. */
  readonly maxExpandedBytes?: number;
}

export class GOZipTextExtractor implements GOTextExtractor {
  public readonly supportedMimeTypes: ReadonlySet<string> = SUPPORTED_MIME_TYPES;
  public readonly supportedExtensions: ReadonlySet<string> = SUPPORTED_EXTENSIONS;

  private readonly registry: GOTextExtractorRegistry | undefined;
  private readonly maxRecursionDepth: number;
  private readonly maxEntries: number;
  private readonly maxEntryBytes: number;
  private readonly maxExpandedBytes: number;

  constructor(config: GOZipTextExtractorConfig = {}) {
    this.registry = config.registry;
    this.maxRecursionDepth = readNonNegativeInteger(
      config.maxRecursionDepth ?? DEFAULT_MAX_RECURSION_DEPTH,
      'maxRecursionDepth',
    );
    this.maxEntries = readPositiveInteger(config.maxEntries ?? DEFAULT_MAX_ENTRIES, 'maxEntries');
    this.maxEntryBytes = readPositiveInteger(config.maxEntryBytes ?? DEFAULT_MAX_ENTRY_BYTES, 'maxEntryBytes');
    this.maxExpandedBytes = readPositiveInteger(
      config.maxExpandedBytes ?? DEFAULT_MAX_EXPANDED_BYTES,
      'maxExpandedBytes',
    );
  }

  public async extract(filePath: string, options?: GOTextExtractionOptions): Promise<GOTextExtractionResult> {
    const signal = options?.signal;
    signal?.throwIfAborted();

    const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
    const currentDepth = readDepth(options);
    if (currentDepth > this.maxRecursionDepth) {
      return { text: '', pages: undefined, truncated: false };
    }

    let archive: Awaited<ReturnType<typeof Open.file>>;
    try {
      archive = await Open.file(filePath);
      signal?.throwIfAborted();
    } catch (error) {
      signal?.throwIfAborted();
      throw new GOTextExtractionError(`Failed to open ZIP: ${filePath}`, filePath, 'application/zip', error);
    }

    const budget = readBudget(options) ?? this.createBudget();
    const output = new BoundedTextOutput(maxBytes);
    let tempDir: string | undefined;

    try {
      reserveEntries(budget, archive.files.length);

      for (const entry of archive.files) {
        signal?.throwIfAborted();
        if (entry.type === 'Directory') continue;

        const entryName = entry.path;
        const entryExt = path.extname(entryName).toLowerCase();

        if (!output.addLine(`--- ${entryName} ---`)) break;

        if (TEXT_LIKE_EXTENSIONS.has(entryExt)) {
          assertDeclaredEntrySize(entry, budget);
          if (!output.beginLine()) break;
          await appendTextEntry(entry, output, budget, signal);
          if (output.truncated) break;
          continue;
        }

        if (this.registry === undefined) continue;
        if (!this.registry.canHandle(undefined, entryName)) continue;

        assertDeclaredEntrySize(entry, budget);
        tempDir ??= await fs.mkdtemp(path.join(os.tmpdir(), 'go-zip-'));
        const tempPath = path.join(tempDir, `${randomUUID()}-${path.basename(entryName)}`);

        try {
          await streamEntryToFile(entry, tempPath, budget, signal);
          const innerOptions = withIncreasedDepth(options, currentDepth, output.remainingBytes, budget);
          const result = await this.registry.extract(undefined, tempPath, innerOptions);
          if (result.text.length > 0 && !output.addLine(result.text)) break;
          if (result.truncated) output.markTruncated();
        } catch (error) {
          signal?.throwIfAborted();
          if (hasZipResourceLimitCause(error)) throw error;

          const message = error instanceof Error ? error.message : 'unknown';
          if (!output.addLine(`(failed to parse: ${message})`)) break;
        }

        if (output.truncated) break;
      }
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof GOTextExtractionError) throw error;

      const detail = error instanceof Error ? `: ${error.message}` : '';
      throw new GOTextExtractionError(
        `Failed to extract ZIP: ${filePath}${detail}`,
        filePath,
        'application/zip',
        error,
      );
    } finally {
      if (tempDir !== undefined) {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          /* best-effort */
        }
      }
    }

    return { text: output.text, pages: undefined, truncated: output.truncated };
  }

  private createBudget(): ZipExtractionBudget {
    return {
      entries: 0,
      expandedBytes: 0,
      maxEntries: this.maxEntries,
      maxEntryBytes: this.maxEntryBytes,
      maxExpandedBytes: this.maxExpandedBytes,
    };
  }
}

class BoundedTextOutput {
  private readonly parts: string[] = [];
  private readonly maxBytes: number;
  private byteLength = 0;
  private hasLine = false;
  private wasTruncated = false;

  constructor(maxBytes: number) {
    this.maxBytes = Math.max(0, Math.floor(maxBytes));
  }

  public get remainingBytes(): number {
    return this.maxBytes - this.byteLength;
  }

  public get text(): string {
    return this.parts.join('');
  }

  public get truncated(): boolean {
    return this.wasTruncated;
  }

  public addLine(value: string): boolean {
    return this.beginLine() && this.append(value);
  }

  public beginLine(): boolean {
    if (this.hasLine && !this.append('\n')) return false;
    this.hasLine = true;
    return true;
  }

  public append(value: string): boolean {
    if (value.length === 0) return true;

    const { text, truncated } = truncateText(value, this.remainingBytes);
    if (text.length > 0) {
      this.parts.push(text);
      this.byteLength += Buffer.byteLength(text, 'utf8');
    }
    if (truncated) this.wasTruncated = true;
    return !truncated;
  }

  public markTruncated(): void {
    this.wasTruncated = true;
  }
}

class ZipResourceLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipResourceLimitError';
  }
}

class ZipBudgetTransform extends Transform {
  private entryBytes = 0;

  constructor(
    private readonly entryName: string,
    private readonly budget: ZipExtractionBudget,
  ) {
    super();
  }

  public override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    try {
      this.entryBytes = consumeExpandedBytes(this.entryName, chunk.byteLength, this.entryBytes, this.budget);
      callback(null, chunk);
    } catch (error) {
      callback(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

async function appendTextEntry(
  entry: ZipEntry,
  output: BoundedTextOutput,
  budget: ZipExtractionBudget,
  signal: AbortSignal | undefined,
): Promise<void> {
  const stream = entry.stream();
  const decoder = new StringDecoder('utf8');
  let entryBytes = 0;
  const abort = (): void => {
    const reason: unknown = signal?.reason;
    stream.destroy(reason instanceof Error ? reason : new Error('ZIP extraction aborted'));
  };

  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    for await (const value of stream as AsyncIterable<unknown>) {
      signal?.throwIfAborted();
      const chunk = toBuffer(value);
      entryBytes = consumeExpandedBytes(entry.path, chunk.byteLength, entryBytes, budget);
      if (!output.append(decoder.write(chunk))) return;
    }
    output.append(decoder.end());
  } finally {
    signal?.removeEventListener('abort', abort);
    if (!stream.destroyed) stream.destroy();
  }
}

async function streamEntryToFile(
  entry: ZipEntry,
  filePath: string,
  budget: ZipExtractionBudget,
  signal: AbortSignal | undefined,
): Promise<void> {
  const source = entry.stream();
  const counter = new ZipBudgetTransform(entry.path, budget);
  const destination = createWriteStream(filePath, { flags: 'wx' });

  if (signal === undefined) {
    await pipeline(source, counter, destination);
  } else {
    await pipeline(source, counter, destination, { signal });
  }
}

function reserveEntries(budget: ZipExtractionBudget, count: number): void {
  if (budget.entries + count > budget.maxEntries) {
    throw new ZipResourceLimitError(`ZIP entry limit exceeded (${String(budget.maxEntries)})`);
  }
  budget.entries += count;
}

function assertDeclaredEntrySize(entry: ZipEntry, budget: ZipExtractionBudget): void {
  if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0) {
    throw new ZipResourceLimitError(`ZIP entry "${entry.path}" has an invalid uncompressed size`);
  }
  if (entry.uncompressedSize > budget.maxEntryBytes) {
    throw new ZipResourceLimitError(
      `ZIP entry "${entry.path}" exceeds the decompressed size limit (${String(budget.maxEntryBytes)} bytes)`,
    );
  }
}

function consumeExpandedBytes(
  entryName: string,
  chunkBytes: number,
  currentEntryBytes: number,
  budget: ZipExtractionBudget,
): number {
  const nextEntryBytes = currentEntryBytes + chunkBytes;
  if (nextEntryBytes > budget.maxEntryBytes) {
    throw new ZipResourceLimitError(
      `ZIP entry "${entryName}" exceeds the decompressed size limit (${String(budget.maxEntryBytes)} bytes)`,
    );
  }

  const nextExpandedBytes = budget.expandedBytes + chunkBytes;
  if (nextExpandedBytes > budget.maxExpandedBytes) {
    throw new ZipResourceLimitError(
      `ZIP expanded data exceeds the total limit (${String(budget.maxExpandedBytes)} bytes)`,
    );
  }

  budget.expandedBytes = nextExpandedBytes;
  return nextEntryBytes;
}

function hasZipResourceLimitCause(error: unknown): boolean {
  let current = error;
  while (current instanceof Error) {
    if (current instanceof ZipResourceLimitError) return true;
    current = current.cause;
  }
  return false;
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value);
  throw new TypeError('ZIP entry stream returned an unsupported chunk type');
}

function readDepth(options: GOTextExtractionOptions | undefined): number {
  if (options === undefined) return 0;
  const value = (options as { [ZIP_DEPTH_SYMBOL]?: number })[ZIP_DEPTH_SYMBOL];
  return typeof value === 'number' ? value : 0;
}

function readBudget(options: GOTextExtractionOptions | undefined): ZipExtractionBudget | undefined {
  if (options === undefined) return undefined;
  return (options as { [ZIP_BUDGET_SYMBOL]?: ZipExtractionBudget })[ZIP_BUDGET_SYMBOL];
}

function withIncreasedDepth(
  options: GOTextExtractionOptions | undefined,
  currentDepth: number,
  maxBytes: number,
  budget: ZipExtractionBudget,
): GOTextExtractionOptions {
  return {
    ...(options ?? {}),
    maxBytes,
    [ZIP_DEPTH_SYMBOL]: currentDepth + 1,
    [ZIP_BUDGET_SYMBOL]: budget,
  } as GOTextExtractionOptions;
}

function readPositiveInteger(value: number, optionName: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${optionName} must be a positive safe integer`);
  }
  return value;
}

function readNonNegativeInteger(value: number, optionName: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${optionName} must be a non-negative safe integer`);
  }
  return value;
}
