/**
 * Reference to a shared document already uploaded to SafeStorage.
 */
export interface SharedDocumentReference {
  readonly key: string;
  readonly versionToken: string;
  readonly sha256: string;
  readonly title?: string;
}
