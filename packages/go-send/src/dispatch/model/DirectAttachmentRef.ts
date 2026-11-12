/**
 * A document already in SafeStorage, as referenced by pn-external-channels.
 */
export interface DirectAttachmentRef {
  /** File key, with or without the `safestorage://` prefix. */
  readonly key: string;
  /** Base64 SHA-256 of the content. */
  readonly sha256: string;
}
