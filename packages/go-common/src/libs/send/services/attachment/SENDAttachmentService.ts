/**
 * SEND Attachment Service for uploading documents to SafeStorage
 */

import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { GOHttpClient } from '../../../core/network/GOHttpClient.js';
import type { GOAbortableRequest } from '../../../core/network/GOAbortableRequest.js';
import type { SENDPreloadResponse } from './models/SENDPreloadResponse.js';
import type { SENDPreloadRequest } from './models/SENDPreloadRequest.js';
import type { SENDAttachmentResult } from './models/SENDAttachmentResult.js';

export class SENDAttachmentService {
  constructor(private readonly httpClient: GOHttpClient) { }

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
  private async requestPreloadUrl(sha256: string, contentType: string = 'application/pdf'): Promise<SENDPreloadResponse> {
    const preloadRequest: SENDPreloadRequest[] = [
      {
        preloadIdx: '0',
        contentType,
        sha256,
      },
    ];

    const response = await this.httpClient.post<SENDPreloadResponse[]>(
      '/delivery/attachments/preload',
      preloadRequest
    );

    if (!response || response.length === 0) {
      throw new Error('Empty preload response from SafeStorage');
    }

    const firstResponse = response[0];
    if (!firstResponse) {
      throw new Error('Empty preload response from SafeStorage');
    }

    return firstResponse;
  }

  /**
   * Upload file to SafeStorage using presigned URL
   */
  private async uploadToSafeStorage(url: string, buffer: Buffer, sha256: string, secret: string): Promise<void> {
    const headers = {
      'Content-Type': 'application/pdf',
      'x-amz-checksum-sha256': sha256,
      'Content-Length': buffer.length.toString(),
      'x-amz-meta-secret': secret,
    };

    await this.httpClient.put(url, buffer, headers);
  }

  /**
   * Upload a PDF file to SafeStorage
   * @param filePathOrBuffer - File path or Buffer
   * @returns Upload result with file reference and digests
   */
  async uploadPDF(filePathOrBuffer: string | Buffer): Promise<SENDAttachmentResult> {
    // Read file if path is provided
    const buffer = typeof filePathOrBuffer === 'string' ? await this.readFileFromDisk(filePathOrBuffer) : filePathOrBuffer;

    // Calculate SHA256
    const sha256 = this.calculateSHA256(buffer);

    // Request preload URL
    const preloadResponse = await this.requestPreloadUrl(sha256, 'application/pdf');

    // Upload to SafeStorage
    await this.uploadToSafeStorage(preloadResponse.url, buffer, sha256, preloadResponse.secret);

    return {
      ref: {
        key: preloadResponse.key,
        versionToken: preloadResponse.versionToken || 'v1',
      },
      digests: {
        sha256,
      },
      buffer,
    };
  }

  /**
   * Upload JSON metadata (for F24)
   * @param data - JSON object to upload
   * @returns Upload result with file reference and digests
   */
  async uploadJSON(data: unknown): Promise<SENDAttachmentResult> {
    // Convert JSON to buffer
    const jsonString = JSON.stringify(data);
    const buffer = Buffer.from(jsonString, 'utf-8');

    // Calculate SHA256
    const sha256 = this.calculateSHA256(buffer);

    // Request preload URL for JSON
    const preloadResponse = await this.requestPreloadUrl(sha256, 'application/json');

    // Upload to SafeStorage (use JSON content type)
    const headers = {
      'Content-Type': 'application/json',
      'x-amz-checksum-sha256': sha256,
      'Content-Length': buffer.length.toString(),
      'x-amz-meta-secret': preloadResponse.secret,
    };

    await this.httpClient.put(preloadResponse.url, buffer, headers);

    return {
      ref: {
        key: preloadResponse.key,
        versionToken: preloadResponse.versionToken || 'v1',
      },
      digests: {
        sha256,
      },
      buffer,
    };
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
   * Upload a PDF file to SafeStorage (abortable)
   * @param filePathOrBuffer - File path or Buffer
   * @returns Abortable request with upload result
   */
  uploadPDFAbortable(filePathOrBuffer: string | Buffer): GOAbortableRequest<SENDAttachmentResult> {
    const controller = new AbortController();

    const promise = (async (): Promise<SENDAttachmentResult> => {
      // Read file if path is provided
      const buffer = typeof filePathOrBuffer === 'string' ? await this.readFileFromDisk(filePathOrBuffer) : filePathOrBuffer;

      if (controller.signal.aborted) {
        throw new Error('Upload aborted');
      }

      // Calculate SHA256
      const sha256 = this.calculateSHA256(buffer);

      // Request preload URL
      const preloadResponse = await this.requestPreloadUrl(sha256, 'application/pdf');

      if (controller.signal.aborted) {
        throw new Error('Upload aborted');
      }

      // Upload to SafeStorage (abortable)
      const uploadAbortable = this.httpClient.putAbortable(
        preloadResponse.url,
        buffer,
        {
          'Content-Type': 'application/pdf',
          'x-amz-checksum-sha256': sha256,
          'Content-Length': buffer.length.toString(),
          'x-amz-meta-secret': preloadResponse.secret,
        }
      );

      // Link external abort to internal upload abort
      const abortListener = () => uploadAbortable.abort();
      controller.signal.addEventListener('abort', abortListener);

      try {
        await uploadAbortable.promise;
      } finally {
        controller.signal.removeEventListener('abort', abortListener);
      }

      return {
        ref: {
          key: preloadResponse.key,
          versionToken: preloadResponse.versionToken || 'v1',
        },
        digests: {
          sha256,
        },
        buffer,
      };
    })();

    return {
      promise,
      abort: () => controller.abort(),
      controller,
    };
  }

  /**
   * Upload JSON metadata (abortable, for F24)
   * @param data - JSON object to upload
   * @returns Abortable request with upload result
   */
  uploadJSONAbortable(data: unknown): GOAbortableRequest<SENDAttachmentResult> {
    const controller = new AbortController();

    const promise = (async (): Promise<SENDAttachmentResult> => {
      // Convert JSON to buffer
      const jsonString = JSON.stringify(data);
      const buffer = Buffer.from(jsonString, 'utf-8');

      if (controller.signal.aborted) {
        throw new Error('Upload aborted');
      }

      // Calculate SHA256
      const sha256 = this.calculateSHA256(buffer);

      // Request preload URL for JSON
      const preloadResponse = await this.requestPreloadUrl(sha256, 'application/json');

      if (controller.signal.aborted) {
        throw new Error('Upload aborted');
      }

      // Upload to SafeStorage (abortable)
      const uploadAbortable = this.httpClient.putAbortable(
        preloadResponse.url,
        buffer,
        {
          'Content-Type': 'application/json',
          'x-amz-checksum-sha256': sha256,
          'Content-Length': buffer.length.toString(),
          'x-amz-meta-secret': preloadResponse.secret,
        }
      );

      // Link external abort to internal upload abort
      const abortListener = () => uploadAbortable.abort();
      controller.signal.addEventListener('abort', abortListener);

      try {
        await uploadAbortable.promise;
      } finally {
        controller.signal.removeEventListener('abort', abortListener);
      }

      return {
        ref: {
          key: preloadResponse.key,
          versionToken: preloadResponse.versionToken || 'v1',
        },
        digests: {
          sha256,
        },
        buffer,
      };
    })();

    return {
      promise,
      abort: () => controller.abort(),
      controller,
    };
  }
}
