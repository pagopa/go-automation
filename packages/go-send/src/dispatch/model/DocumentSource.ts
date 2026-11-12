import type { PraticaDocumentSource } from './PraticaDocumentSource.js';
import type { ReferenceDocumentSource } from './ReferenceDocumentSource.js';
import type { RowFilesDocumentSource } from './RowFilesDocumentSource.js';
import type { SharedDocumentSource } from './SharedDocumentSource.js';

/**
 * Where the documents of a row come from, in precedence order (§8.1.1).
 */
export type DocumentSource =
  PraticaDocumentSource | RowFilesDocumentSource | ReferenceDocumentSource | SharedDocumentSource;
