/**
 * Worker result
 */

import type { SENDNotificationRow } from './SENDNotificationRow.js';
import type { SENDNotificationImportWorkerError } from './SENDNotificationImportWorkerError.js';
import type { SENDNotificationDiscardedInfo } from './SENDNotificationImportRowProcessor.js';

export interface SENDNotificationImportWorkerResult {
  /** Sent notifications (if sendNotifications=true) */
  sentNotifications: {
    row: SENDNotificationRow;
    notificationRequestId: string;
    iun?: string | undefined;
    discarded?: SENDNotificationDiscardedInfo | undefined;
  }[];

  /** Statistics */
  stats: {
    totalRows: number;
    processedRows: number;
    documentsUploaded: number;
    notificationsSent: number;
    iunsObtained: number;
    discardedRows: number;
    failedRows: number;
    processingTime: number;
  };

  /** Errors (if skipFailedNotifications=true) */
  errors?: SENDNotificationImportWorkerError[] | undefined;
}
