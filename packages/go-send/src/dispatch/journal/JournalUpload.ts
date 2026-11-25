/**
 * Upload recorded by a `DOCUMENT_UPLOADED` journal entry.
 */
export interface JournalUpload {
  readonly sha256: string;
  readonly key: string;
  readonly versionToken: string;
  readonly contentType: string;
}
