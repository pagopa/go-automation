import { GOConcurrencyPool, GOHttpClientError } from '@go-automation/go-common/core';

import type { SENDPreloadResponse } from '../../services/attachment/models/SENDPreloadResponse.js';
import type { DocumentRef } from '../model/DocumentRef.js';
import type { DocumentToUpload } from './DocumentToUpload.js';
import type { InspectedDocument } from './InspectedDocument.js';
import type { RetriedOperationFn } from './RetriedOperationFn.js';
import type { PendingUpload } from './PendingUpload.js';
import type { UploadedFile } from './UploadedFile.js';
import { UploadError } from './UploadError.js';
import type { UploadStageOptions } from './UploadStageOptions.js';

const MAX_PRELOAD_BATCH = 15;
const DEFAULT_BATCH_WAIT_MS = 200;
const DEFAULT_UPLOAD_CONCURRENCY = 5;
const DEFAULT_PRESIGNED_MAX_AGE_MS = 15 * 60_000;
const DEFAULT_REUSE_MAX_AGE_MS = 72 * 3_600_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_MS = 1_000;

/**
 * Uploads the documents of the rows to SafeStorage (§8.1.1), in pipeline with
 * the sends.
 *
 * - **Deduplication by SHA-256:** the same content is uploaded once per run,
 *   whatever its path; concurrent requests share the same promise.
 * - **Batched preload:** up to `batchSize` distinct files per preload call
 *   (one B2B call through the limiter), or whatever arrived within
 *   `batchWaitMs`; then the PUTs run in parallel (`uploadConcurrency`,
 *   outside the limiter: they go to S3).
 * - **Presigned URL expiry:** a PUT not started within `presignedMaxAgeMs`
 *   of its preload goes back to the batch queue for a new preload.
 * - **Retries:** preload 5xx/429/transport and PUT failures are retried
 *   (3 attempts); a preload 4xx is final (`UPLOAD_REJECTED`).
 * - Every upload is journaled (`DOCUMENT_UPLOADED`) so a resume can reuse it.
 */
export class UploadStage {
  private readonly uploads = new Map<string, Promise<UploadedFile>>();
  private readonly queue: PendingUpload[] = [];
  private readonly putPool: GOConcurrencyPool;
  private readonly batchSize: number;
  private readonly batchWaitMs: number;
  private readonly presignedMaxAgeMs: number;
  private flushScheduled = false;
  private preloadSeq = 0;

  constructor(private readonly options: UploadStageOptions) {
    const batchSize = options.batchSize ?? MAX_PRELOAD_BATCH;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_PRELOAD_BATCH) {
      throw new Error(`UploadStage: batchSize must be an integer in [1, ${MAX_PRELOAD_BATCH}] (got ${batchSize})`);
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
    return upload;
  }

  private seedPreviousUploads(): void {
    const maxAge = this.options.reuseMaxAgeMs ?? DEFAULT_REUSE_MAX_AGE_MS;
    const now = this.options.clock.now();
    for (const previous of this.options.previousUploads ?? []) {
      if (now - Date.parse(previous.ts) > maxAge) continue;
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
    let responses: ReadonlyArray<SENDPreloadResponse>;
    try {
      responses = await this.withRetries(async () => {
        await this.options.limiter.acquire(0);
        return this.options.gateway.preload(requests);
      });
    } catch (error: unknown) {
      const rejected = error instanceof GOHttpClientError && isClientError(error.statusCode);
      const failure = new UploadError(
        rejected ? 'UPLOAD_REJECTED' : 'UPLOAD_FAILED',
        `preload failed: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
      for (const pending of batch) pending.reject(failure);
      return;
    }

    const preloadedAt = this.options.clock.now();
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
    if (this.options.clock.now() - preloadedAt > this.presignedMaxAgeMs) {
      this.enqueue(pending); // presigned URL about to expire: new preload
      return;
    }
    try {
      const versionToken = await this.withRetries(async () =>
        this.options.gateway.upload(preload, pending.path, pending.sha256, pending.contentType),
      );
      const file: UploadedFile = {
        key: preload.key,
        versionToken,
        sha256: pending.sha256,
        contentType: pending.contentType,
      };
      await this.options.ledger.record({ event: 'DOCUMENT_UPLOADED', upload: file });
      pending.resolve(file);
    } catch (error: unknown) {
      pending.reject(
        new UploadError('UPLOAD_FAILED', `upload failed: ${error instanceof Error ? error.message : String(error)}`, {
          cause: error,
        }),
      );
    }
  }

  private async withRetries<T>(operation: RetriedOperationFn<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await operation();
      } catch (error: unknown) {
        const permanent = error instanceof GOHttpClientError && isClientError(error.statusCode);
        if (permanent || attempt >= MAX_ATTEMPTS) throw error;
        const retryAfter = error instanceof GOHttpClientError ? error.retryAfterMs : undefined;
        await this.options.clock.sleep(retryAfter ?? RETRY_BASE_MS * 2 ** (attempt - 1));
      }
    }
  }
}

/** 4xx other than 408/429: the request itself is wrong, retrying cannot help. */
function isClientError(status: number | undefined): boolean {
  return status !== undefined && status >= 400 && status < 500 && status !== 408 && status !== 429;
}
