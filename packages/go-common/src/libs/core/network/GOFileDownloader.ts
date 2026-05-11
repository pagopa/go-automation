/**
 * Streaming file downloader with retry, atomic writes and SHA-256 verification.
 *
 * Designed for binary content (PDF, DOCX, XLSX, archives) that should not be
 * loaded entirely into memory. Built on top of Node's `fetch` (powered by
 * undici) to share runtime behaviour with `GOHttpClient` while exposing a
 * dedicated streaming API.
 *
 * Features:
 *  - Streaming download via `Response.body` reader (no full-buffer load).
 *  - Atomic write: stream to a `<destPath>.partial` file then rename.
 *  - SHA-256 hash computed during the stream (single pass).
 *  - Configurable retry on 429/5xx/network errors with exponential backoff
 *    and jitter; honours `Retry-After` header on 429.
 *  - Header redaction: `Authorization`, `Cookie` etc. never appear in errors.
 *  - Configurable per-request timeout via AbortController.
 *
 * @example
 * ```typescript
 * const downloader = new GOFileDownloader({
 *   defaultHeaders: { Authorization: 'Basic …' },
 *   maxRetries: 3,
 *   timeoutMs: 60_000,
 * });
 *
 * const result = await downloader.downloadToFile(
 *   'https://example.com/file.pdf',
 *   '/tmp/file.pdf',
 * );
 * console.log(`${result.bytesWritten} bytes, sha256=${result.sha256}`);
 * ```
 */
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ProxyAgent } from 'undici';
import type { Dispatcher } from 'undici';

import type { GOFileDownloaderConfig } from './GOFileDownloaderConfig.js';
import { GOFileDownloaderError } from './GOFileDownloaderError.js';
import type { GOFileDownloadResult } from './GOFileDownloadResult.js';

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BACKOFF_BASE_MS = 1_000;
const DEFAULT_BACKOFF_JITTER_MS = 200;
const DEFAULT_REDACT_HEADERS: ReadonlyArray<string> = ['authorization', 'cookie'];
const RETRYABLE_STATUS_CODES: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504]);

export class GOFileDownloader {
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffBaseMs: number;
  private readonly backoffJitterMs: number;
  private readonly redactHeaders: ReadonlySet<string>;
  private readonly proxyAgent: Dispatcher | undefined;

  constructor(config: GOFileDownloaderConfig = {}) {
    this.defaultHeaders = { ...(config.defaultHeaders ?? {}) };
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.backoffBaseMs = config.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.backoffJitterMs = config.backoffJitterMs ?? DEFAULT_BACKOFF_JITTER_MS;
    this.redactHeaders = new Set(
      (config.redactHeaders ?? DEFAULT_REDACT_HEADERS).map((header) => header.toLowerCase()),
    );

    if (config.proxyUrl !== undefined && config.proxyUrl.length > 0) {
      this.proxyAgent = new ProxyAgent(config.proxyUrl);
    }
  }

  /**
   * Downloads a URL to a local file, streaming bytes through a SHA-256 hasher.
   *
   * @param url - Absolute URL to download.
   * @param destPath - Absolute destination file path.
   * @param options - Optional per-call overrides (extra headers, abort signal).
   * @returns Resolved download result with hash and stats.
   * @throws GOFileDownloaderError on non-2xx response after retries, or on
   *         unrecoverable network/IO errors.
   */
  public async downloadToFile(
    url: string,
    destPath: string,
    options: { readonly headers?: Readonly<Record<string, string>>; readonly signal?: AbortSignal } = {},
  ): Promise<GOFileDownloadResult> {
    const startedAt = Date.now();
    const requestHeaders = { ...this.defaultHeaders, ...(options.headers ?? {}) };

    await fs.mkdir(path.dirname(destPath), { recursive: true });
    const partialPath = `${destPath}.partial`;

    let attempt = 0;
    while (true) {
      attempt += 1;
      try {
        const result = await this.singleAttempt(url, requestHeaders, partialPath, options.signal);
        await fs.rename(partialPath, destPath);
        return {
          finalUrl: result.finalUrl,
          statusCode: result.statusCode,
          bytesWritten: result.bytesWritten,
          sha256: result.sha256,
          durationMs: Date.now() - startedAt,
          attempts: attempt,
          contentType: result.contentType,
        };
      } catch (error) {
        await this.cleanupPartial(partialPath);

        if (!this.isRetriable(error) || attempt > this.maxRetries) {
          throw this.toDownloaderError(error, url, attempt);
        }

        const delayMs = this.computeBackoff(error, attempt);
        await this.sleep(delayMs);
      }
    }
  }

  private async singleAttempt(
    url: string,
    headers: Record<string, string>,
    partialPath: string,
    externalSignal: AbortSignal | undefined,
  ): Promise<{
    readonly finalUrl: string;
    readonly statusCode: number;
    readonly bytesWritten: number;
    readonly sha256: string;
    readonly contentType: string | undefined;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    const onExternalAbort = (): void => controller.abort();
    if (externalSignal !== undefined) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }

    try {
      const init: RequestInit = {
        method: 'GET',
        headers,
        signal: controller.signal,
        redirect: 'follow',
      };

      const fetchOptions: RequestInit =
        this.proxyAgent !== undefined ? ({ ...init, dispatcher: this.proxyAgent } as unknown as RequestInit) : init;

      const response = await fetch(url, fetchOptions);

      if (!response.ok) {
        const retryAfter = this.parseRetryAfter(response.headers.get('retry-after'));
        const error = new RetriableHttpError(
          `HTTP ${response.status} ${response.statusText}`,
          response.status,
          retryAfter,
        );
        // Drain body to free the connection
        try {
          await response.body?.cancel();
        } catch {
          /* ignore */
        }
        throw error;
      }

      if (response.body === null) {
        throw new GOFileDownloaderError('Response body is null', url, 1, response.status);
      }

      const hash = createHash('sha256');
      let bytesWritten = 0;

      // `stream.pipeline` propagates errors from any leg (network/timeout/
      // disk-full) and guarantees that the writable target and every
      // intermediate transform are destroyed on failure — no dangling fds and
      // no unhandled 'error' events on the underlying writeStream.
      const source = Readable.fromWeb(response.body);
      const tap = new Transform({
        transform(chunk: Buffer | Uint8Array, _encoding, callback): void {
          const buffer = chunk instanceof Buffer ? chunk : Buffer.from(chunk);
          hash.update(buffer);
          bytesWritten += buffer.byteLength;
          callback(null, buffer);
        },
      });
      const writeStream = createWriteStream(partialPath, { flags: 'w' });
      await pipeline(source, tap, writeStream, { signal: controller.signal });

      return {
        finalUrl: response.url,
        statusCode: response.status,
        bytesWritten,
        sha256: hash.digest('hex'),
        contentType: response.headers.get('content-type') ?? undefined,
      };
    } finally {
      clearTimeout(timeoutId);
      if (externalSignal !== undefined) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  private async cleanupPartial(partialPath: string): Promise<void> {
    try {
      await fs.unlink(partialPath);
    } catch {
      /* file may not exist */
    }
  }

  private isRetriable(error: unknown): boolean {
    if (error instanceof RetriableHttpError) {
      return RETRYABLE_STATUS_CODES.has(error.statusCode);
    }
    if (error instanceof Error) {
      // AbortError → request timed out, retriable
      if (error.name === 'AbortError') return true;
      // Network errors typically expose a `code` property via cause
      const cause = (error as { cause?: unknown }).cause;
      if (cause instanceof Error && /ECONN|ETIMEDOUT|ENOTFOUND|UND_ERR/.test(cause.message)) {
        return true;
      }
    }
    return false;
  }

  private computeBackoff(error: unknown, attempt: number): number {
    if (error instanceof RetriableHttpError && error.retryAfterMs !== undefined) {
      return error.retryAfterMs;
    }
    const exponential = this.backoffBaseMs * 2 ** (attempt - 1);
    const jitter = Math.floor(Math.random() * this.backoffJitterMs);
    return exponential + jitter;
  }

  private parseRetryAfter(headerValue: string | null): number | undefined {
    if (headerValue === null) return undefined;
    const seconds = Number.parseInt(headerValue, 10);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1_000;
    }
    const dateMs = Date.parse(headerValue);
    if (Number.isFinite(dateMs)) {
      const delta = dateMs - Date.now();
      return delta > 0 ? delta : 0;
    }
    return undefined;
  }

  private toDownloaderError(error: unknown, url: string, attempts: number): GOFileDownloaderError {
    if (error instanceof GOFileDownloaderError) return error;
    if (error instanceof RetriableHttpError) {
      return new GOFileDownloaderError(
        `Download failed: ${this.redactErrorMessage(error.message)}`,
        url,
        attempts,
        error.statusCode,
      );
    }
    if (error instanceof Error) {
      return new GOFileDownloaderError(`Download failed: ${this.redactErrorMessage(error.message)}`, url, attempts);
    }
    return new GOFileDownloaderError('Download failed: unknown error', url, attempts);
  }

  private redactErrorMessage(message: string): string {
    let redacted = message;
    for (const headerName of this.redactHeaders) {
      const re = new RegExp(`(${headerName}[^\\n,;]{0,5}:?\\s*)[^\\s,;]+`, 'gi');
      redacted = redacted.replace(re, '$1<redacted>');
    }
    return redacted;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

class RetriableHttpError extends Error {
  public readonly statusCode: number;
  public readonly retryAfterMs: number | undefined;

  constructor(message: string, statusCode: number, retryAfterMs?: number) {
    super(message);
    this.name = 'RetriableHttpError';
    this.statusCode = statusCode;
    this.retryAfterMs = retryAfterMs;
  }
}
