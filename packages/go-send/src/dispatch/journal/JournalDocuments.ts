import type { DocumentSourceKind } from '../model/DocumentSourceKind.js';

/**
 * Documents referenced by a `SENDING` journal entry.
 */
export interface JournalDocuments {
  readonly source: DocumentSourceKind;
  readonly keys: ReadonlyArray<string>;
  readonly sha256: ReadonlyArray<string>;
}
