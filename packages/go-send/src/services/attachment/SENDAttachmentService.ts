/**
 * SEND Attachment Service for uploading documents to SafeStorage
 */

import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { GOHttpClient } from '@go-automation/go-common/core';
import type { GOAbortableRequest } from '@go-automation/go-common/core';
import type { SENDPreloadResponse } from './models/SENDPreloadResponse.js';
import type { SENDPreloadRequest } from './models/SENDPreloadRequest.js';
import type { SENDAttachmentResult } from './models/SENDAttachmentResult.js';

/** Default content type used when none is specified */
const DEFAULT_CONTENT_TYPE = 'application/pdf';

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
 * Serializes an unexpected response body for error messages, with secret
 * values redacted and the result truncated
 */
function truncateForError(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  const redacted = text.replace(/"secret"\s*:\s*"[^"]*"/gi, '"secret":"[REDACTED]"');
  const maxLength = 300;
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength)}…` : redacted;
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
    return await readFile(filePath);
  }

  /**
   * Request preload URL from SafeStorage
   */
  private async requestPreloadUrl(
    sha256: string,
    contentType: string = DEFAULT_CONTENT_TYPE,
  ): Promise<SENDPreloadResponse> {
    const preloadRequest: SENDPreloadRequest[] = [
      {
        preloadIdx: '0',
        contentType,
        sha256,
      },
    ];

    const rawResponse = await this.httpClient.post<SENDPreloadResponse[] | string>(
      '/delivery/attachments/preload',
      preloadRequest,
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

    const firstResponse: unknown = response[0];
    if (firstResponse === null || typeof firstResponse !== 'object') {
      throw new Error('Empty preload response from SafeStorage');
    }

    const candidate = firstResponse as Record<string, unknown>;

    // Validate the fields required by the presigned upload: a malformed
    // response would otherwise surface as a cryptic fetch error later
    // (e.g. "Failed to parse URL from undefined")
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

    // The API may request a presigned POST upload; only PUT is supported
    if (candidate['httpMethod'] === 'POST') {
      throw new Error(
        `SafeStorage requested an HTTP POST upload, which is not supported yet (expected PUT): ${formatPreloadResponseForError(
          candidate,
        )}`,
      );
    }

    return candidate as unknown as SENDPreloadResponse; // Safe: url, key and secret validated above
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
  ): Promise<Record<string, string>> {
    return await this.httpClient.put(url, buffer, this.buildUploadHeaders(sha256, secret, contentType));
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
        versionToken: nonEmptyString(versionId) ?? nonEmptyString(preloadResponse.versionToken) ?? 'v1',
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
