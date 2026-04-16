/**
 * Registers event listeners for monitoring import workflow progress.
 */

import { Core } from '@go-automation/go-common';
import type { SENDNotificationImportWorker, SENDNotificationRow } from '@go-automation/go-send';

/**
 * Sets up event listeners for monitoring workflow progress.
 *
 * @param worker - The notification import worker
 * @param importer - The CSV importer
 * @param exporter - The CSV exporter (optional)
 * @param prompt - The GOPrompt instance for spinner management
 */
export function setupEventListeners(
  worker: SENDNotificationImportWorker,
  importer: Core.GOCSVListImporter<SENDNotificationRow>,
  exporter: Core.GOCSVListExporter<Record<string, unknown>> | undefined,
  prompt: Core.GOPrompt,
): void {
  // Worker events
  worker.on('worker:progress', (event) => {
    const progress = event.progress;
    if (progress.phase === 'importing') {
      const msg = `[IMPORT] ${progress.percentage}% - Rows: ${progress.processedRows}, Valid: ${progress.processedRows - progress.failedRows}, Invalid: ${progress.failedRows}`;
      prompt.spin('importing', `\x1b[36m>\x1b[0m ${msg}`);
    } else {
      const msg = `[PROCESS] ${progress.percentage}% - Processed: ${progress.processedRows}/${progress.totalRows}, Uploaded: ${progress.documentsUploaded}, Sent: ${progress.notificationsSent}, IUNs: ${progress.iunsObtained}, Failed: ${progress.failedRows}`;
      prompt.spinLog(`\x1b[36m>\x1b[0m ${msg}`);
    }
  });

  worker.on('worker:document:uploaded', (event) => {
    if ('subject' in event.row) {
      prompt.spin(event.row.subject, `Document uploaded: ${event.row.subject}`);
    }
  });

  worker.on('worker:notification:sent', (event) => {
    if ('subject' in event.row) {
      const spinnerId = event.response.notificationRequestId;
      prompt.spin(spinnerId, `Notification sent, waiting for IUN: ${event.row.subject}`);
    }
  });

  worker.on('worker:iun:obtained', (event) => {
    if ('subject' in event.row) {
      const spinnerId = event.notificationRequestId;
      prompt.spinSucceed(spinnerId, `IUN obtained: ${event.row.subject} - ${event.iun}`);
    }
  });

  worker.on('worker:iun:polling:attempt', (event) => {
    if ('subject' in event.row) {
      const spinnerId = event.notificationRequestId;
      const subject = event.row.subject;
      let message = `Polling IUN [${event.attempt}/${event.maxAttempts}]: ${subject} - Status: ${event.status}`;

      if (event.errors && event.errors.length > 0) {
        const errorDetails = event.errors
          .map((err: string | Record<string, unknown>) => (typeof err === 'string' ? err : JSON.stringify(err)))
          .join('\n    ');
        message += ` Errors: ${errorDetails}`;
        prompt.spinFail(spinnerId, message);
      } else {
        prompt.spin(spinnerId, message);
      }
    }
  });

  worker.on('worker:iun:polling:failed', (event) => {
    if ('subject' in event.row) {
      const spinnerId = event.notificationRequestId;
      prompt.spinFail(spinnerId, `IUN polling failed after ${event.attempts} attempts: ${event.row.subject}`);
    }
  });

  worker.on('worker:error', (event) => {
    let errorMsg = `\x1b[31mX\x1b[0m Error at row ${event.error.rowIndex} [${event.error.type}]: ${event.error.message}`;

    if (event.error.details !== undefined && event.error.details !== null) {
      const details =
        typeof event.error.details === 'object'
          ? JSON.stringify(event.error.details, null, 2)
          : JSON.stringify(event.error.details);
      errorMsg += `\n    Details: ${details}`;
    }

    prompt.spinLog(errorMsg);
  });

  // Importer events
  importer.on('import:started', (event) => {
    prompt.spinLog(`Import started: ${event.source}`);
  });

  importer.on('import:completed', (event) => {
    prompt.spinSucceed(
      'importing',
      `\x1b[32mOK\x1b[0m Import completed: ${event.totalItems} items, ` +
        `${event.invalidItems} invalid (${event.duration}ms)`,
    );
  });

  // Exporter events
  if (exporter) {
    exporter.on('export:started', (event) => {
      prompt.spinLog(`Export started: ${event.itemCount} items`);
    });

    exporter.on('export:completed', (event) => {
      prompt.spinLog(`\x1b[32mOK\x1b[0m Export completed: ${event.totalItems} items (${event.duration}ms)`);
    });
  }
}
