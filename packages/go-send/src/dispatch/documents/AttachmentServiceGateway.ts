import { GOBinaryFileImporter } from '@go-automation/go-common/core';

import type { SENDPreloadRequest } from '../../services/attachment/models/SENDPreloadRequest.js';
import type { SENDPreloadResponse } from '../../services/attachment/models/SENDPreloadResponse.js';
import type { SENDAttachmentService } from '../../services/attachment/SENDAttachmentService.js';
import type { SafeStorageGateway } from './SafeStorageGateway.js';

/**
 * {@link SafeStorageGateway} backed by `SENDAttachmentService`.
 */
export class AttachmentServiceGateway implements SafeStorageGateway {
  constructor(private readonly attachments: SENDAttachmentService) {}

  public async preload(requests: ReadonlyArray<SENDPreloadRequest>): Promise<ReadonlyArray<SENDPreloadResponse>> {
    return this.attachments.preloadMany(requests);
  }

  public async upload(
    preload: SENDPreloadResponse,
    filePath: string,
    sha256: string,
    contentType: string,
  ): Promise<string> {
    const buffer = await new GOBinaryFileImporter({ inputPath: filePath }).import();
    if (buffer === undefined) throw new Error(`${filePath}: file not found`);
    return this.attachments.uploadToPresignedUrl(preload, buffer, sha256, contentType);
  }
}
