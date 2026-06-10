/**
 * Result of loading a send-upload-attachments results file
 */

import type { SENDUploadedAttachment } from './SENDUploadedAttachment.js';
import type { SENDUploadedAttachmentSkipped } from './SENDUploadedAttachmentSkipped.js';

/**
 * Attachments loaded from a send-upload-attachments results file,
 * grouped by `pratica` and ready to be passed to the import worker.
 */
export interface SENDUploadedAttachmentsLoadResult {
  /** Usable attachments grouped by pratica, each group sorted by filePath */
  readonly attachmentsByPratica: ReadonlyMap<string, readonly SENDUploadedAttachment[]>;

  /** Total number of usable attachments across all groups */
  readonly totalAttachments: number;

  /** Records skipped because failed or malformed */
  readonly skipped: readonly SENDUploadedAttachmentSkipped[];
}
