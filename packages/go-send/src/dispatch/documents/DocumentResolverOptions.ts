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
  /** Absent in a dry run, or when no SafeStorage gateway is configured. */
  readonly uploadStage?: UploadStage;
  /**
   * Dry run: without an upload stage, row files get a placeholder key
   * `<upload:sha256>`. Outside a dry run a missing upload stage is a
   * `CONFIGURATION` error: placeholders must never reach SEND.
   */
  readonly placeholders: boolean;
}
