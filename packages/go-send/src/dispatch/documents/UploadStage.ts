import { GOConcurrencyPool } from '@pagopa/go-common/concurrency';
import { getErrorMessage } from '@pagopa/go-common/errors';
import { GOHttpClientError } from '@pagopa/go-common/http';
import { GOBackoff, type GOBackoffFn } from '@pagopa/go-common/polling';

import type { SENDPreloadResponse } from '../../services/attachment/models/SENDPreloadResponse.js';
import { MAX_PRELOAD_ITEMS } from '../../services/attachment/SENDAttachmentService.js';
import type { DocumentRef } from '../model/DocumentRef.js';
import type { DocumentToUpload } from './DocumentToUpload.js';
import type { InspectedDocument } from './InspectedDocument.js';
import type { RetriedOperationFn } from './RetriedOperationFn.js';
import type { PendingUpload } from './PendingUpload.js';
import type { UploadedFile } from './UploadedFile.js';
import { UploadError } from './UploadError.js';
import type { UploadStageOptions } from './UploadStageOptions.js';

const DEFAULT_BATCH_WAIT_MS = 200;
const DEFAULT_UPLOAD_CONCURRENCY = 5;
const DEFAULT_PRESIGNED_MAX_AGE_MS = 15 * 60_000;
const DEFAULT_REUSE_MAX_AGE_MS = 72 * 3_600_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 30_000;

/**
 * Uploads the documents of the rows to SafeStorage (§8.1.1), in pipeline with
 * the sends.
 *
 * - **Deduplication by SHA-256:** the same content is uploaded once per run,
 *   whatever its path; concurrent requests share the same promise. A failed
 *   upload leaves the cache, so a later row with that content tries again.
 * - **Batched preload:** up to `batchSize` distinct files per preload call
 *   (one B2B call through the limiter), or whatever arrived within
 *   `batchWaitMs`; then the PUTs run in parallel (`uploadConcurrency`,
 *   outside the limiter: they go to S3).
 * - **Presigned URL expiry:** a PUT not started within `presignedMaxAgeMs`
 *   of its preload goes back to the batch queue for a new preload.
 * - **Retries:** preload 5xx/429/transport and PUT failures are retried
 *   (3 attempts); a preload 4xx is final (`UPLOAD_REJECTED`).
 * - Every upload is journaled (`DOCUMENT_UPLOADED`) so a resume can reuse it;
 *   a journal failure is not an upload failure: it rejects the rows with the
 *   journal error itself.
 * - A stop (`signal`) abandons preloads, PUTs and retry waits: no upload is
 *   journaled for them, the resume uploads again.
 */
export class UploadStage {
  private readonly uploads = new Map<string, Promise<UploadedFile>>();
  private readonly queue: PendingUpload[] = [];
  private readonly putPool: GOConcurrencyPool;
  private readonly batchSize: number;
  private readonly batchWaitMs: number;
  private readonly presignedMaxAgeMs: number;
  private readonly retryBackoff: GOBackoffFn = GOBackoff.exponential(RETRY_BASE_MS, RETRY_MAX_MS);
  private flushScheduled = false;
  private preloadSeq = 0;

  constructor(private readonly options: UploadStageOptions) {
    const batchSize = options.batchSize ?? MAX_PRELOAD_ITEMS;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_PRELOAD_ITEMS) {
      throw new Error(`UploadStage: batchSize must be an integer in [1, ${MAX_PRELOAD_ITEMS}] (got ${batchSize})`);
    }
    this.batchSize = batchSize;
    this.batchWaitMs = options.batchWaitMs ?? DEFAULT_BATCH_WAIT_MS;
    this.presignedMaxAgeMs = options.presignedMaxAgeMs ?? DEFAULT_PRESIGNED_MAX_AGE_MS;
    this.putPool = new GOConcurrencyPool(options.uploadConcurrency ?? DEFAULT_UPLOAD_CONCURRENCY);
    this.seedPreviousUploads();
  }

  /**
   * Uploads (or reuses) the documents of a row.
   *
   * @param documents - Inspected documents with their titles, in `docIdx` order
   * @returns SafeStorage references, in the same order
   * @throws UploadError when any document cannot be uploaded
   */
  public async resolve(documents: ReadonlyArray<DocumentToUpload>): Promise<ReadonlyArray<DocumentRef>> {
    const files = await Promise.all(documents.map(async ({ inspected }) => this.upload(inspected)));
    return files.map((file, index) => ({
      key: file.key,
      versionToken: file.versionToken,
      sha256: file.sha256,
      contentType: file.contentType,
      title: documents[index]?.title ?? file.key,
    }));
  }

  /**
   * Uploads one document, deduplicated by SHA-256.
   *
   * @param inspected - Inspected document
   * @returns The SafeStorage reference
   */
  public async upload(inspected: InspectedDocument): Promise<UploadedFile> {
    const existing = this.uploads.get(inspected.sha256);
    if (existing !== undefined) return existing;
    const upload = new Promise<UploadedFile>((resolve, reject) => {
      this.enqueue({
        sha256: inspected.sha256,
        contentType: inspected.contentType,
        path: inspected.path,
        resolve,
        reject,
      });
    });
    this.uploads.set(inspected.sha256, upload);
    // A failure is shared only by the rows already waiting on it: the next row
    // with the same content tries again (the outage may be over by then).
    upload.catch(() => {
      if (this.uploads.get(inspected.sha256) === upload) this.uploads.delete(inspected.sha256);
    });
    return upload;
  }

  private seedPreviousUploads(): void {
    const maxAge = this.options.reuseMaxAgeMs ?? DEFAULT_REUSE_MAX_AGE_MS;
    const now = this.options.clock.now();
    for (const previous of this.options.previousUploads ?? []) {
      const recordedAt = Date.parse(previous.ts);
      // An unreadable timestamp cannot prove the upload is recent: upload again.
      if (!Number.isFinite(recordedAt) || now - recordedAt > maxAge) continue;
      this.uploads.set(
        previous.sha256,
        Promise.resolve({
          key: previous.key,
          versionToken: previous.versionToken,
          sha256: previous.sha256,
          contentType: previous.contentType,
        }),
      );
    }
  }

  private enqueue(pending: PendingUpload): void {
    this.queue.push(pending);
    if (this.queue.length >= this.batchSize) {
      void this.flush();
    } else if (!this.flushScheduled) {
      this.flushScheduled = true;
      void this.options.clock.sleep(this.batchWaitMs).then(async () => {
        this.flushScheduled = false;
        await this.flush();
      });
    }
  }

  private async flush(): Promise<void> {
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, this.batchSize);
      await this.preloadBatch(batch);
    }
  }

  private async preloadBatch(batch: ReadonlyArray<PendingUpload>): Promise<void> {
    const requests = batch.map((pending) => ({
      preloadIdx: String(this.preloadSeq++),
      contentType: pending.contentType,
      sha256: pending.sha256,
    }));
    const signal = this.options.signal;
    let responses: ReadonlyArray<SENDPreloadResponse>;
    try {
      responses = await this.withRetries(async () => {
        await this.options.limiter.acquire(0, signal);
        return this.options.gateway.preload(requests, signal);
      });
    } catch (error: unknown) {
      const rejected = error instanceof GOHttpClientError && isClientError(error.statusCode);
      const failure = new UploadError(
        rejected ? 'UPLOAD_REJECTED' : 'UPLOAD_FAILED',
        `preload failed: ${getErrorMessage(error)}`,
        { cause: error },
      );
      for (const pending of batch) pending.reject(failure);
      return;
    }

    const preloadedAt = this.options.clock.monotonic();
    for (const [index, pending] of batch.entries()) {
      const preload = responses[index];
      if (preload === undefined) {
        pending.reject(new UploadError('UPLOAD_FAILED', 'preload response missing for file'));
        continue;
      }
      void this.putPool.run(async () => this.put(pending, preload, preloadedAt));
    }
  }

  private async put(pending: PendingUpload, preload: SENDPreloadResponse, preloadedAt: number): Promise<void> {
    if (this.options.clock.monotonic() - preloadedAt > this.presignedMaxAgeMs) {
      this.enqueue(pending); // presigned URL about to expire: new preload
      return;
    }
    let versionToken: string;
    try {
      versionToken = await this.withRetries(async () =>
        this.options.gateway.upload(preload, pending.path, pending.sha256, pending.contentType, this.options.signal),
      );
    } catch (error: unknown) {
      pending.reject(new UploadError('UPLOAD_FAILED', `upload failed: ${getErrorMessage(error)}`, { cause: error }));
      return;
    }
    const file: UploadedFile = {
      key: preload.key,
      versionToken,
      sha256: pending.sha256,
      contentType: pending.contentType,
    };
    try {
      await this.options.ledger.record({ event: 'DOCUMENT_UPLOADED', upload: file });
    } catch (error: unknown) {
      pending.reject(error); // the journal failed, not the upload: surfaces as is
      return;
    }
    pending.resolve(file);
  }

  private async withRetries<T>(operation: RetriedOperationFn<T>): Promise<T> {
    const signal = this.options.signal;
    for (let attempt = 1; ; attempt++) {
      try {
        return await operation();
      } catch (error: unknown) {
        const permanent = error instanceof GOHttpClientError && isClientError(error.statusCode);
        if (permanent || attempt >= MAX_ATTEMPTS || signal?.aborted === true) throw error;
        const retryAfter = error instanceof GOHttpClientError ? error.retryAfterMs : undefined;
        await this.options.clock.sleep(retryAfter ?? this.retryBackoff({ attempt: attempt - 1 }), signal);
      }
    }
  }
}

/** 4xx other than 408/429: the request itself is wrong, retrying cannot help. */
function isClientError(status: number | undefined): boolean {
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
}
