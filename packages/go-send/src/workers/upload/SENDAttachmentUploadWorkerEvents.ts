import type { SENDAttachmentUploadedFile } from './SENDAttachmentUploadedFile.js';
import type { SENDAttachmentUploadRow } from './SENDAttachmentUploadRow.js';
import type { SENDAttachmentUploadWorkerError } from './SENDAttachmentUploadWorkerError.js';
import type { SENDAttachmentUploadWorkerProgress } from './SENDAttachmentUploadWorkerProgress.js';

/**
 * Event emitted to report worker progress
 */
export interface SENDAttachmentUploadWorkerProgressEvent {
  /** Progress counters */
  progress: SENDAttachmentUploadWorkerProgress;
}

/**
 * Event emitted when a file is uploaded to SafeStorage
 */
export interface SENDAttachmentUploadWorkerFileUploadedEvent {
  /** The row being processed */
  row: SENDAttachmentUploadRow;
  /** Upload information */
  upload: SENDAttachmentUploadedFile;
}

/**
 * Event emitted when an error occurs during processing
 */
export interface SENDAttachmentUploadWorkerErrorEvent {
  /** Error details */
  error: SENDAttachmentUploadWorkerError;
}

/**
 * Map of all worker events
 * Used for type-safe event emission and listening
 */
export interface SENDAttachmentUploadWorkerEventMap {
  /** Emitted to report progress */
  'worker:progress': SENDAttachmentUploadWorkerProgressEvent;

  /** Emitted when a file is uploaded */
  'worker:file:uploaded': SENDAttachmentUploadWorkerFileUploadedEvent;

  /** Emitted when an error occurs */
  'worker:error': SENDAttachmentUploadWorkerErrorEvent;
}
