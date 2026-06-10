/**
 * SEND Preload response from SafeStorage
 *
 * Mirrors the PreLoadResponse schema of the PN external b2b API
 * (POST /delivery/attachments/preload). Note: the version token is NOT part
 * of this response — it is returned by the subsequent presigned upload in
 * the x-amz-version-id response header.
 */

export interface SENDPreloadResponse {
  /** Correlation id with the request */
  preloadIdx?: string;
  /** SafeStorage file key (globally unique, used in the notification request) */
  key: string;
  /** Not returned by the PN API (see x-amz-version-id); kept for backward compatibility */
  versionToken?: string;
  /** Presigned URL for upload */
  url: string;
  /** Secret for upload authentication (x-amz-meta-secret header) */
  secret: string;
  /** HTTP method to use for the upload (PUT or POST) */
  httpMethod: string;
}
