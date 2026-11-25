import type { DocumentRef } from './DocumentRef.js';

/**
 * Document already uploaded, referenced by the row (key/versionToken/sha256).
 */
export interface ReferenceDocumentSource {
  readonly kind: 'reference';
  readonly refs: ReadonlyArray<DocumentRef>;
}
