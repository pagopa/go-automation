/**
 * SEND Attachment Service for uploading documents to SafeStorage
 */

import { createHash } from 'crypto';
import { GOBinaryFileImporter, GOHttpClient } from '@go-automation/go-common/core';
import type { GOAbortableRequest, GOHttpRequestOptions } from '@go-automation/go-common/core';
import type { SENDPreloadResponse } from './models/SENDPreloadResponse.js';
import type { SENDPreloadRequest } from './models/SENDPreloadRequest.js';
import type { SENDAttachmentResult } from './models/SENDAttachmentResult.js';

/** Default content type used when none is specified */
const DEFAULT_CONTENT_TYPE = 'application/pdf';

/** Items accepted by one preload call (`400 PN_GENERIC_INVALIDPARAMETER_SIZE` beyond) */
export const MAX_PRELOAD_ITEMS = 15;

/** Version token used when neither the upload nor the preload returns one */
const FALLBACK_VERSION_TOKEN = 'v1';

/**
 * Serializes a preload response for error messages, redacting the secret
 */
function formatPreloadResponseForError(response: Record<string, unknown>): string {
  const safeResponse: Record<string, unknown> = { ...response };
  if (typeof safeResponse['secret'] === 'string' && safeResponse['secret'] !== '') {
    safeResponse['secret'] = '[REDACTED]';
  }
  return JSON.stringify(safeResponse);
}

/**
 * Parses a raw preload body returned with a non-JSON content type; returns
 * the raw string when it is not valid JSON (the array guard reports it)
 */
function parsePreloadBody(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function nonEmptyString(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

/**
 * Version token of an uploaded file: the `x-amz-version-id` of the presigned
 * upload, else the (legacy) preload one, else `v1`
 *
 * @param preload - Preload response of the file
 * @param versionId - `x-amz-version-id` response header of the upload, if any
 * @returns The version token to put in `ref.versionToken`
 */
function resolveVersionToken(preload: SENDPreloadResponse, versionId: string | undefined): string {
  return nonEmptyString(versionId) ?? nonEmptyString(preload.versionToken) ?? FALLBACK_VERSION_TOKEN;
}

/**
 * Checks the preload requests before the call: at most
 * {@link MAX_PRELOAD_ITEMS} items, each with a distinct `preloadIdx`
 */
function validatePreloadRequests(requests: ReadonlyArray<SENDPreloadRequest>): void {
  if (requests.length > MAX_PRELOAD_ITEMS) {
    throw new Error(`At most ${MAX_PRELOAD_ITEMS} files per preload call (got ${requests.length})`);
  }
  const indexes = new Set<string>();
  for (const request of requests) {
    if (indexes.has(request.preloadIdx))
      throw new Error(`Duplicate preloadIdx ${request.preloadIdx} in preload request`);
    indexes.add(request.preloadIdx);
  }
}

/**
 * Pairs each request with its response item. When every item carries
 * `preloadIdx` the pairing is strict (a missing or repeated index throws);
 * otherwise it is purely positional, so a partial `preloadIdx` can never give
 * the same presigned URL to two files
 */
function matchPreloadResponses(
  requests: ReadonlyArray<SENDPreloadRequest>,
  items: ReadonlyArray<SENDPreloadResponse>,
): ReadonlyArray<SENDPreloadResponse> {
  if (!items.every((item) => item.preloadIdx !== undefined)) {
    return requests.map((request, index) => {
      const item = items[index];
      if (item === undefined) throw new Error(`Preload response missing for preloadIdx ${request.preloadIdx}`);
      return item;
    });
  }
  const byIdx = new Map<string, SENDPreloadResponse>();
  for (const item of items) {
    const idx = item.preloadIdx ?? '';
    if (byIdx.has(idx)) throw new Error(`Preload response from SafeStorage repeats preloadIdx ${idx}`);
    byIdx.set(idx, item);
  }
  return requests.map((request) => {
    const item = byIdx.get(request.preloadIdx);
    if (item === undefined) throw new Error(`Preload response missing for preloadIdx ${request.preloadIdx}`);
    return item;
  });
}

/**
 * Serializes an unexpected response body for error messages, with secret
 * values redacted and the result truncated
 */
function truncateForError(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const redacted = text.replace(/"secret"\s*:\s*"[^"]*"/gi, '"secret":"[REDACTED]"');
  const maxLength = 300;
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength)}…` : redacted;
}

/**
 * Validates one item of a preload response: the fields required by the
 * presigned upload must be present (a malformed response would otherwise
 * surface as a cryptic fetch error later, e.g. "Failed to parse URL from
 * undefined"), and only PUT uploads are supported.
 */
function validatePreloadItem(item: unknown): SENDPreloadResponse {
  if (item === null || typeof item !== 'object') {
    throw new Error('Empty preload response from SafeStorage');
  }
  const candidate = item as Record<string, unknown>;
  const missingFields = (['url', 'key', 'secret'] as const).filter(
    (field) => typeof candidate[field] !== 'string' || candidate[field] === '',
  );
  if (missingFields.length > 0) {
    throw new Error(
      `Invalid preload response from SafeStorage (missing or empty: ${missingFields.join(', ')}): ${formatPreloadResponseForError(
        candidate,
      )}`,
    );
  }
  if (candidate['httpMethod'] === 'POST') {
    throw new Error(
      `SafeStorage requested an HTTP POST upload, which is not supported yet (expected PUT): ${formatPreloadResponseForError(
        candidate,
      )}`,
    );
  }
  return candidate as unknown as SENDPreloadResponse; // Safe: url, key and secret validated above
}

export class SENDAttachmentService {
  constructor(private readonly httpClient: GOHttpClient) {}

  /**
   * Calculate SHA256 hash of a buffer
   */
  calculateSHA256(buffer: Buffer): string {
    const hash = createHash('sha256');
    hash.update(buffer);
    return hash.digest('base64');
  }

  /**
   * Read file from disk
   */
  async readFileFromDisk(filePath: string): Promise<Buffer> {
    const content = await new GOBinaryFileImporter({ inputPath: filePath }).import();
    // Not `optional`: a missing file already rejects with ENOENT, so this only guards the type.
    if (content === undefined) throw new Error(`${filePath}: file not readable`);
    return content;
  }

  /**
   * Request preload URL from SafeStorage
   */
  private async requestPreloadUrl(
    sha256: string,
    contentType: string = DEFAULT_CONTENT_TYPE,
  ): Promise<SENDPreloadResponse> {
    const [response] = await this.preloadMany([{ preloadIdx: '0', contentType, sha256 }]);
    if (response === undefined) {
      throw new Error('Empty preload response from SafeStorage');
    }
    return response;
  }

  /**
   * Requests presigned upload URLs for several files in one call.
   *
   * SEND accepts at most {@link MAX_PRELOAD_ITEMS} items per call
   * (`400 PN_GENERIC_INVALIDPARAMETER_SIZE` beyond). Every response item is
   * validated (url, key and secret present, PUT upload); responses are
   * returned in request order, matched strictly by `preloadIdx` when every
   * item carries it, by position otherwise.
   *
   * @param requests - Preload requests, each with a distinct `preloadIdx`; none: no call
   * @param options - Per-request controls (e.g. an abort `signal`)
   * @returns One validated preload response per request, in request order
   * @throws Error when the requests are more than {@link MAX_PRELOAD_ITEMS} or
   *   repeat a `preloadIdx`, or the response does not match them
   */
  async preloadMany(
    requests: ReadonlyArray<SENDPreloadRequest>,
    options?: GOHttpRequestOptions,
  ): Promise<ReadonlyArray<SENDPreloadResponse>> {
    if (requests.length === 0) return [];
    validatePreloadRequests(requests);
    const rawResponse = await this.httpClient.post<SENDPreloadResponse[] | string>(
      '/delivery/attachments/preload',
      requests,
      undefined,
      options,
    );

    // Some PN environments return the JSON body with a non-JSON content
    // type, so the http client leaves it as raw text: parse it here
    const response = typeof rawResponse === 'string' ? parsePreloadBody(rawResponse) : rawResponse;

    if (!Array.isArray(response)) {
      throw new Error(
        `Unexpected preload response from SafeStorage (expected a JSON array): ${truncateForError(response)}`,
      );
    }
    if (response.length === 0) {
      throw new Error('Empty preload response from SafeStorage');
    }
    if (response.length !== requests.length) {
      throw new Error(`Preload response from SafeStorage has ${response.length} items for ${requests.length} requests`);
    }

    const validated = response.map((item: unknown) => validatePreloadItem(item));
    return matchPreloadResponses(requests, validated);
  }

  /**
   * Uploads content to a presigned URL obtained from {@link preloadMany}.
   *
   * @param preload - Preload response of the file
   * @param buffer - File content
   * @param sha256 - Base64 SHA-256 of `buffer`, as sent in the preload request
   * @param contentType - MIME type, as sent in the preload request
   * @param options - Per-request controls (e.g. an abort `signal`)
   * @returns The version token (`x-amz-version-id`, or the preload one, or `v1`)
   */
  async uploadToPresignedUrl(
    preload: SENDPreloadResponse,
    buffer: Buffer,
    sha256: string,
    contentType: string,
    options?: GOHttpRequestOptions,
  ): Promise<string> {
    const headers = await this.uploadToSafeStorage(preload.url, buffer, sha256, preload.secret, contentType, options);
    return resolveVersionToken(preload, headers['x-amz-version-id']);
  }

  /**
   * Build the headers required by the SafeStorage presigned URL upload
   *
   * Content-Length is intentionally not set: it is a forbidden header for
   * fetch (undici rejects it on Node >= 26) and is computed automatically
   * from the buffer body with the same wire-level result.
   */
  private buildUploadHeaders(sha256: string, secret: string, contentType: string): Record<string, string> {
    return {
      'Content-Type': contentType,
      'x-amz-checksum-sha256': sha256,
      'x-amz-meta-secret': secret,
    };
  }

  /**
   * Upload file to SafeStorage using presigned URL
   *
   * @returns The upload response headers (e.g. x-amz-version-id)
   */
  private async uploadToSafeStorage(
    url: string,
    buffer: Buffer,
    sha256: string,
    secret: string,
    contentType: string,
    options?: GOHttpRequestOptions,
  ): Promise<Record<string, string>> {
    return await this.httpClient.put(url, buffer, this.buildUploadHeaders(sha256, secret, contentType), options);
  }

  /**
   * Build the upload result from the preload response and the version id
   * returned by the presigned upload (x-amz-version-id response header),
   * which the PN API requires as ref.versionToken in notification requests
   */
  private buildResult(
    preloadResponse: SENDPreloadResponse,
    sha256: string,
    buffer: Buffer,
    versionId?: string,
  ): SENDAttachmentResult {
    return {
      ref: {
        key: preloadResponse.key,
        versionToken: resolveVersionToken(preloadResponse, versionId),
      },
      digests: {
        sha256,
      },
      buffer,
    };
  }

  /**
   * Upload a file to SafeStorage with an explicit content type
   *
   * Generic upload flow: read file (if a path is provided), compute the
   * SHA256 digest, request a presigned URL from SafeStorage and PUT the
   * content with the matching headers.
   *
   * @param filePathOrBuffer - File path or Buffer
   * @param contentType - MIME type of the content (default: 'application/pdf')
   * @returns Upload result with file reference and digests
   */
  async upload(
    filePathOrBuffer: string | Buffer,
    contentType: string = DEFAULT_CONTENT_TYPE,
  ): Promise<SENDAttachmentResult> {
    // Read file if path is provided
    const buffer =
      typeof filePathOrBuffer === 'string' ? await this.readFileFromDisk(filePathOrBuffer) : filePathOrBuffer;

    // Calculate SHA256
    const sha256 = this.calculateSHA256(buffer);

    // Request preload URL
    const preloadResponse = await this.requestPreloadUrl(sha256, contentType);

    // Upload to SafeStorage; the response carries the document version id
    const uploadResponseHeaders = await this.uploadToSafeStorage(
      preloadResponse.url,
      buffer,
      sha256,
      preloadResponse.secret,
      contentType,
    );

    return this.buildResult(preloadResponse, sha256, buffer, uploadResponseHeaders['x-amz-version-id']);
  }

  /**
   * Upload a PDF file to SafeStorage
   * @param filePathOrBuffer - File path or Buffer
   * @returns Upload result with file reference and digests
   */
  async uploadPDF(filePathOrBuffer: string | Buffer): Promise<SENDAttachmentResult> {
    return await this.upload(filePathOrBuffer, 'application/pdf');
  }

  /**
   * Upload JSON metadata (for F24)
   * @param data - JSON object to upload
   * @returns Upload result with file reference and digests
   */
  async uploadJSON(data: unknown): Promise<SENDAttachmentResult> {
    const jsonString = JSON.stringify(data);
    const buffer = Buffer.from(jsonString, 'utf-8');

    return await this.upload(buffer, 'application/json');
  }

  /**
   * Upload multiple files
   */
  async uploadMultiplePDFs(filePaths: string[]): Promise<SENDAttachmentResult[]> {
    const results: SENDAttachmentResult[] = [];

    for (const filePath of filePaths) {
      const result = await this.uploadPDF(filePath);
      results.push(result);
    }

    return results;
  }

  /**
   * Upload a file to SafeStorage with an explicit content type (abortable)
   *
   * Same flow as {@link upload}, but the returned request can be aborted
   * between phases and during the PUT to the presigned URL.
   *
   * @param filePathOrBuffer - File path or Buffer
   * @param contentType - MIME type of the content (default: 'application/pdf')
   * @returns Abortable request with upload result
   */
  uploadAbortable(
    filePathOrBuffer: string | Buffer,
    contentType: string = DEFAULT_CONTENT_TYPE,
  ): GOAbortableRequest<SENDAttachmentResult> {
    const controller = new AbortController();

    const promise = (async (): Promise<SENDAttachmentResult> => {
      // Read file if path is provided
      const buffer =
        typeof filePathOrBuffer === 'string' ? await this.readFileFromDisk(filePathOrBuffer) : filePathOrBuffer;

      if (controller.signal.aborted) {
        throw new Error('Upload aborted');
      }

      // Calculate SHA256
      const sha256 = this.calculateSHA256(buffer);

      // Request preload URL
      const preloadResponse = await this.requestPreloadUrl(sha256, contentType);

      if (controller.signal.aborted) {
        throw new Error('Upload aborted');
      }

      // Upload to SafeStorage (abortable)
      const uploadAbortable = this.httpClient.putAbortable(
        preloadResponse.url,
        buffer,
        this.buildUploadHeaders(sha256, preloadResponse.secret, contentType),
      );

      // Link external abort to internal upload abort
      const abortListener = (): void => uploadAbortable.abort();
      controller.signal.addEventListener('abort', abortListener);

      let uploadResponseHeaders: Record<string, string>;
      try {
        uploadResponseHeaders = await uploadAbortable.promise;
      } finally {
        controller.signal.removeEventListener('abort', abortListener);
      }

      return this.buildResult(preloadResponse, sha256, buffer, uploadResponseHeaders['x-amz-version-id']);
    })();

    return {
      promise,
      abort: () => controller.abort(),
      controller,
    };
  }

  /**
   * Upload a PDF file to SafeStorage (abortable)
   * @param filePathOrBuffer - File path or Buffer
   * @returns Abortable request with upload result
   */
  uploadPDFAbortable(filePathOrBuffer: string | Buffer): GOAbortableRequest<SENDAttachmentResult> {
    return this.uploadAbortable(filePathOrBuffer, 'application/pdf');
  }

  /**
   * Upload JSON metadata (abortable, for F24)
   * @param data - JSON object to upload
   * @returns Abortable request with upload result
   */
  uploadJSONAbortable(data: unknown): GOAbortableRequest<SENDAttachmentResult> {
    const jsonString = JSON.stringify(data);
    const buffer = Buffer.from(jsonString, 'utf-8');

    return this.uploadAbortable(buffer, 'application/json');
  }
}
