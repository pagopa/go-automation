import type { SENDPreloadRequest } from '../../services/attachment/models/SENDPreloadRequest.js';
import type { SENDPreloadResponse } from '../../services/attachment/models/SENDPreloadResponse.js';

/**
 * SafeStorage operations used by the upload stage; faked in tests.
 */
export interface SafeStorageGateway {
  /** One B2B preload call for up to 15 files. */
  preload(requests: ReadonlyArray<SENDPreloadRequest>): Promise<ReadonlyArray<SENDPreloadResponse>>;
  /** PUT of the file to its presigned URL; returns the version token. */
  upload(preload: SENDPreloadResponse, filePath: string, sha256: string, contentType: string): Promise<string>;
}
