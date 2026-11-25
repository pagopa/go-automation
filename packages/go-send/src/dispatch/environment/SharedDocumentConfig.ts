import type { SharedDocumentReference } from './SharedDocumentReference.js';

/**
 * Shared document of an environment (`defaults.documents.shared`) or of the
 * CLI (`--document-file`): either files to upload once per run, or a
 * reference to a document already uploaded. Exactly one of the two.
 */
export interface SharedDocumentConfig {
  /** Absolute paths, uploaded once in preflight; one document each. */
  readonly files?: ReadonlyArray<string>;
  readonly reference?: SharedDocumentReference;
  /** Title of the documents (default: file name without extension). */
  readonly title?: string;
}
