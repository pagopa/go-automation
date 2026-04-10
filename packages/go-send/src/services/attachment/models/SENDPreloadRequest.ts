/**
 * SEND Preload request item
 */

export interface SENDPreloadRequest {
  /** Preload index (for array requests) */
  preloadIdx: string;
  /** Content type */
  contentType: string;
  /** SHA256 hash */
  sha256: string;
}
