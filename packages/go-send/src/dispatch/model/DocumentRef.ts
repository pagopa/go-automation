/**
 * A document already stored in SafeStorage, ready to be referenced by a
 * notification.
 */
export interface DocumentRef {
  readonly key: string;
  readonly versionToken: string;
  /** SHA-256 of the content, Base64 (44 characters). */
  readonly sha256: string;
  readonly contentType: string;
  readonly title: string;
}
