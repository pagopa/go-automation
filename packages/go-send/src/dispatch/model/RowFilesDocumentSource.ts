import type { LocalDocument } from './LocalDocument.js';

/**
 * Files of the row, uploaded by the run (`UploadStage`).
 */
export interface RowFilesDocumentSource {
  readonly kind: 'rowFiles';
  readonly files: ReadonlyArray<LocalDocument>;
}
