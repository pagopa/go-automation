import type { UploadedFileResolveFn } from './UploadedFileResolveFn.js';
import type { UploadRejectFn } from './UploadRejectFn.js';

/**
 * A distinct file waiting for its preload batch.
 */
export interface PendingUpload {
  readonly sha256: string;
  readonly contentType: string;
  readonly path: string;
  readonly resolve: UploadedFileResolveFn;
  readonly reject: UploadRejectFn;
}
