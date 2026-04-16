/**
 * SEND Preload response from SafeStorage
 */

export interface SENDPreloadResponse {
  /** SafeStorage file key */
  key: string;
  /** Version token */
  versionToken: string;
  /** Presigned URL for upload */
  url: string;
  /** Secret for upload authentication */
  secret: string;
  /** HTTP method for upload */
  httpMethod: string;
}
