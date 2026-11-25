import type { UploadedFile } from './UploadedFile.js';

/**
 * Settles a pending upload with its SafeStorage reference.
 */
export type UploadedFileResolveFn = (file: UploadedFile) => void;
