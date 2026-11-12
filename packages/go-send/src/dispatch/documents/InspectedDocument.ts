/**
 * A local document that passed the checks of `LocalDocumentInspector`.
 */
export interface InspectedDocument {
  readonly path: string;
  readonly size: number;
  /** Base64 SHA-256 of the content. */
  readonly sha256: string;
  readonly contentType: string;
}
