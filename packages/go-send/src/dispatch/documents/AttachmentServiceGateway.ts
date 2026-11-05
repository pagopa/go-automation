import { GOBinaryFileImporter } from '@go-automation/go-common/core';
import type { GOHttpRequestOptions } from '@go-automation/go-common/core';

import type { SENDPreloadRequest } from '../../services/attachment/models/SENDPreloadRequest.js';
import type { SENDPreloadResponse } from '../../services/attachment/models/SENDPreloadResponse.js';
import type { SENDAttachmentService } from '../../services/attachment/SENDAttachmentService.js';
import type { SafeStorageGateway } from './SafeStorageGateway.js';

/**
 * {@link SafeStorageGateway} backed by `SENDAttachmentService`.
 */
export class AttachmentServiceGateway implements SafeStorageGateway {
  constructor(private readonly attachments: SENDAttachmentService) {}

  /**
   * Requests presigned upload URLs for several files in one call.
   *
   * @param requests - One request per file (at most 15)
   * @param signal - Abandons the call on a stop
   * @returns One response per request, matched by `preloadIdx`
   */
  public async preload(
    requests: ReadonlyArray<SENDPreloadRequest>,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<SENDPreloadResponse>> {
    return this.attachments.preloadMany(requests, requestOptions(signal));
  }

  /**
   * Reads the file and PUTs it to the presigned URL.
   *
   * @throws The read error (e.g. `ENOENT`) when the file cannot be read
   */
  public async upload(
    preload: SENDPreloadResponse,
    filePath: string,
    sha256: string,
    contentType: string,
    signal?: AbortSignal,
  ): Promise<string> {
    const buffer = await new GOBinaryFileImporter({ inputPath: filePath }).import();
    // Not `optional`: a missing file already rejects with ENOENT, so this only guards the type.
    if (buffer === undefined) throw new Error(`${filePath}: file not readable`);
    return this.attachments.uploadToPresignedUrl(preload, buffer, sha256, contentType, requestOptions(signal));
  }
}

function requestOptions(signal: AbortSignal | undefined): GOHttpRequestOptions | undefined {
  return signal === undefined ? undefined : { signal };
}
