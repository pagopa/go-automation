import type { SENDAttachmentResult } from '../../services/attachment/models/SENDAttachmentResult.js';
import type { SENDNotificationCreationResponse } from '../../services/notification/models/SENDNotificationCreationResponse.js';
import type { SENDNotificationImportWorkerProgress } from './SENDNotificationImportWorkerProgress.js';
import type { SENDNotificationImportWorkerError } from './SENDNotificationImportWorkerError.js';
import type { SENDNotificationRow } from './SENDNotificationRow.js';

/**
 * Event emitted to report worker progress
 */
export interface SENDNotificationImportWorkerProgressEvent {
  /** Progress data */
  progress: SENDNotificationImportWorkerProgress;
}

/**
 * Event emitted when a document is uploaded
 */
export interface SENDNotificationImportWorkerDocumentUploadedEvent {
  /** The row being processed */
  row: SENDNotificationRow;
  /** Upload result */
  uploadResult: SENDAttachmentResult;
}

/**
 * Event emitted when a notification is sent
 */
export interface SENDNotificationImportWorkerNotificationSentEvent {
  /** The row being processed */
  row: SENDNotificationRow;
  /** Notification creation response */
  response: SENDNotificationCreationResponse;
}

/**
 * Event emitted when an IUN is obtained
 */
export interface SENDNotificationImportWorkerIunObtainedEvent {
  /** The row being processed */
  row: SENDNotificationRow;
  /** Notification request ID */
  notificationRequestId: string;
  /** IUN obtained */
  iun: string;
}

/**
 * Event emitted during IUN polling attempt
 */
export interface SENDNotificationImportWorkerIunPollingAttemptEvent {
  /** The row being processed */
  row: SENDNotificationRow;
  /** Notification request ID */
  notificationRequestId: string;
  /** Current attempt number */
  attempt: number;
  /** Maximum attempts */
  maxAttempts: number;
  /** Notification status */
  status: string;
  /** Whether IUN was found in this attempt */
  iunFound: boolean;
  /** List of errors (if any) - can be strings or error objects */
  errors?: Array<string | Record<string, any>> | undefined;
}

/**
 * Event emitted when IUN polling fails after max attempts
 */
export interface SENDNotificationImportWorkerIunPollingFailedEvent {
  /** The row being processed */
  row: SENDNotificationRow;
  /** Notification request ID */
  notificationRequestId: string;
  /** Number of attempts made */
  attempts: number;
  /** Error message */
  error: string;
}

/**
 * Event emitted when an error occurs during processing
 */
export interface SENDNotificationImportWorkerErrorEvent {
  /** Error details */
  error: SENDNotificationImportWorkerError;
}

/**
 * Map of all worker events
 * Used for type-safe event emission and listening
 */
export interface SENDNotificationImportWorkerEventMap {
  /** Emitted to report progress */
  'worker:progress': SENDNotificationImportWorkerProgressEvent;

  /** Emitted when a document is uploaded */
  'worker:document:uploaded': SENDNotificationImportWorkerDocumentUploadedEvent;

  /** Emitted when a notification is sent */
  'worker:notification:sent': SENDNotificationImportWorkerNotificationSentEvent;

  /** Emitted when an IUN is obtained */
  'worker:iun:obtained': SENDNotificationImportWorkerIunObtainedEvent;

  /** Emitted during IUN polling attempt */
  'worker:iun:polling:attempt': SENDNotificationImportWorkerIunPollingAttemptEvent;

  /** Emitted when IUN polling fails */
  'worker:iun:polling:failed': SENDNotificationImportWorkerIunPollingFailedEvent;

  /** Emitted when an error occurs */
  'worker:error': SENDNotificationImportWorkerErrorEvent;
}
