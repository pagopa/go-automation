/**
 * Worker result
 */

import type { SENDNotificationRow } from './SENDNotificationRow.js';
import type { SENDNotificationImportWorkerError } from './SENDNotificationImportWorkerError.js';

export interface SENDNotificationImportWorkerResult {
  /** Sent notifications (if sendNotifications=true) */
  sentNotifications: Array<{
    row: SENDNotificationRow;
    notificationRequestId: string;
    iun?: string | undefined;
  }>;

  /** Statistics */
  stats: {
    totalRows: number;
    processedRows: number;
    documentsUploaded: number;
    notificationsSent: number;
    iunsObtained: number;
    failedRows: number;
    processingTime: number;
  };

  /** Errors (if skipFailedNotifications=true) */
  errors?: SENDNotificationImportWorkerError[] | undefined;
}
