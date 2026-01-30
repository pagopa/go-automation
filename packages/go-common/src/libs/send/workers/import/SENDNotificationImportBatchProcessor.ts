/**
 * Batch Processor - Handles concurrent batch processing
 */

import { GOEventEmitterBase } from '../../../core/events/GOEventEmitterBase.js';
import { getErrorMessage } from '../../../core/errors/GOErrorUtils.js';

import { SENDNotificationImportRowProcessor } from './SENDNotificationImportRowProcessor.js';
import type { SENDNotificationImportWorkerError } from './SENDNotificationImportWorkerError.js';
import type { SENDNotificationImportWorkerEventMap } from './SENDNotificationImportWorkerEvents.js';
import type { SENDNotificationImportWorkerOptions } from './SENDNotificationImportWorkerOptions.js';
import type { SENDNotificationImportWorkerResult } from './SENDNotificationImportWorkerResult.js';
import type { SENDNotificationRow } from './SENDNotificationRow.js';

export class SENDNotificationImportBatchProcessor extends GOEventEmitterBase<SENDNotificationImportWorkerEventMap> {
  constructor(private readonly rowProcessor: SENDNotificationImportRowProcessor) {
    super();

    // Forward events from RowProcessor to enable real-time export
    // When IUN is obtained, Worker can export immediately instead of waiting for batch completion
    this.rowProcessor.on('worker:iun:obtained', (event) => {
      this.emit('worker:iun:obtained', event);
    });

    this.rowProcessor.on('worker:notification:sent', (event) => {
      this.emit('worker:notification:sent', event);
    });

    this.rowProcessor.on('worker:document:uploaded', (event) => {
      this.emit('worker:document:uploaded', event);
    });

    this.rowProcessor.on('worker:iun:polling:attempt', (event) => {
      this.emit('worker:iun:polling:attempt', event);
    });

    this.rowProcessor.on('worker:iun:polling:failed', (event) => {
      this.emit('worker:iun:polling:failed', event);
    });
  }

  async processBatch(
    rows: SENDNotificationRow[],
    options: SENDNotificationImportWorkerOptions | undefined,
    baseProcessedRows: number,
    baseFailedRows: number,
    errors: SENDNotificationImportWorkerError[],
    totalRowsFromImport: number,
  ): Promise<SENDNotificationImportWorkerResult> {
    const concurrency = options?.concurrency ?? 1;
    const skipFailedNotifications = options?.skipFailedNotifications ?? false;

    const sentNotifications: {
      row: SENDNotificationRow;
      notificationRequestId: string;
      iun?: string | undefined;
    }[] = [];
    const stats = {
      processedRows: 0,
      documentsUploaded: 0,
      notificationsSent: 0,
      iunsObtained: 0,
      failedRows: 0,
    };

    // Process rows in slices of size 'concurrency' to control parallelism
    // This prevents overwhelming the API with too many concurrent requests
    for (let i = 0; i < rows.length; i += concurrency) {
      const slice = rows.slice(i, i + concurrency);

      // Use Promise.allSettled when skipFailedNotifications=true to continue processing even if some rows fail
      // Use Promise.all when skipFailedNotifications=false to stop immediately on first error
      if (skipFailedNotifications) {
        const results = await Promise.allSettled(
          slice.map(async (row) => this.rowProcessor.processRow(row, options)),
        );
        results.forEach((result, idx) => {
          if (result.status === 'fulfilled') {
            this.handleSuccess(result.value, sentNotifications, stats);
          } else {
            const row = slice[idx];
            if (row) {
              this.handleError(result.reason, row, baseProcessedRows + i + idx + 1, errors, stats);
            }
          }
        });
      } else {
        const results = await Promise.all(
          slice.map(async (row) => this.rowProcessor.processRow(row, options)),
        );
        results.forEach((result) => this.handleSuccess(result, sentNotifications, stats));
      }

      // Fix: Use totalRowsFromImport instead of calculating incorrectly
      const totalRows = totalRowsFromImport;
      const processedRows = baseProcessedRows + stats.processedRows;
      const percentage = totalRows > 0 ? Math.round((processedRows / totalRows) * 100) : 0;

      this.emit('worker:progress', {
        progress: {
          phase: 'processing',
          totalRows,
          processedRows,
          documentsUploaded: stats.documentsUploaded,
          notificationsSent: stats.notificationsSent,
          iunsObtained: stats.iunsObtained,
          failedRows: baseFailedRows + stats.failedRows,
          currentBatch: 0,
          percentage,
        },
      });
    }

    return {
      sentNotifications,
      stats: {
        totalRows: rows.length,
        ...stats,
        processingTime: 0,
      },
      errors: undefined,
    };
  }

  private handleSuccess(
    result: {
      row: SENDNotificationRow;
      docUploaded: boolean;
      notificationResult: { notificationRequestId: string; iun?: string | undefined } | null;
    },
    sentNotifications: {
      row: SENDNotificationRow;
      notificationRequestId: string;
      iun?: string | undefined;
    }[],
    stats: {
      processedRows: number;
      documentsUploaded: number;
      notificationsSent: number;
      iunsObtained: number;
      failedRows: number;
    },
  ): void {
    if (result.docUploaded) stats.documentsUploaded++;
    if (result.notificationResult) {
      sentNotifications.push({
        row: result.row,
        notificationRequestId: result.notificationResult.notificationRequestId,
        iun: result.notificationResult.iun,
      });
      stats.notificationsSent++;
      if (result.notificationResult.iun) stats.iunsObtained++;
    }
    stats.processedRows++;
  }

  private handleError(
    error: unknown,
    row: SENDNotificationRow,
    rowIndex: number,
    errors: SENDNotificationImportWorkerError[],
    stats: {
      processedRows: number;
      documentsUploaded: number;
      notificationsSent: number;
      iunsObtained: number;
      failedRows: number;
    },
  ): void {
    stats.failedRows++;

    // Enhanced error message for better debugging
    let errorMessage = getErrorMessage(error);
    const isAbortError = this.isAbortError(error);
    if (isAbortError || errorMessage.includes('Request aborted')) {
      errorMessage = `${errorMessage} (Timeout or network issue - check API response time)`;
    }

    const workerError: SENDNotificationImportWorkerError = {
      rowIndex: rowIndex,
      rowData: row,
      message: errorMessage,
      type: this.getErrorType(error),
      details: this.getErrorDetails(error),
    };
    errors.push(workerError);
    this.emit('worker:error', { error: workerError });
  }

  /**
   * Check if error is an AbortError (timeout or cancelled request)
   */
  private isAbortError(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.includes('Request aborted'))
    );
  }

  /**
   * Extract error details (response data if available)
   */
  private getErrorDetails(error: unknown): unknown {
    if (typeof error === 'object' && error !== null && 'response' in error) {
      return (error as { response: unknown }).response;
    }
    return error;
  }

  /**
   * Determine error type based on error content
   */
  private getErrorType(error: unknown): SENDNotificationImportWorkerError['type'] {
    const message = getErrorMessage(error);
    if (message.includes('upload') || message.includes('document')) return 'upload';
    if (message.includes('build') || message.includes('validation')) return 'build';

    // Check for API response errors
    if (typeof error === 'object' && error !== null) {
      if ('statusCode' in error || 'response' in error) return 'send';
    }

    return 'build';
  }
}
