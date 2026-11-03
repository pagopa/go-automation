import type { SENDUploadedAttachment } from '../../workers/import/SENDUploadedAttachment.js';
import type { DocumentRef } from '../model/DocumentRef.js';
import type { LocalDocumentInspector } from './LocalDocumentInspector.js';
import type { UploadStage } from './UploadStage.js';

/**
 * Run-level sources of {@link ./DocumentResolver.DocumentResolver}.
 */
export interface DocumentResolverOptions {
  /** References of the shared document, prepared in preflight. */
  readonly shared?: ReadonlyArray<DocumentRef>;
  /** Output of `send-upload-attachments`, by pratica. */
  readonly attachmentsByPratica?: ReadonlyMap<string, ReadonlyArray<SENDUploadedAttachment>>;
  readonly inspector: LocalDocumentInspector;
  /** Absent in a dry run: row files get a placeholder key `<upload:sha256>`. */
  readonly uploadStage?: UploadStage;
}
