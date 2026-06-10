/**
 * Registers event listeners for monitoring upload workflow progress.
 */

import { Core } from '@go-automation/go-common';
import type { SENDAttachmentUploadRow, SENDAttachmentUploadWorker } from '@go-automation/go-send';

/** Spinner identifier for the overall upload progress */
const PROGRESS_SPINNER_ID = 'uploading';

/**
 * Sets up event listeners for monitoring workflow progress.
 *
 * @param worker - The attachment upload worker
 * @param importer - The input file importer
 * @param prompt - The GOPrompt instance for spinner management
 */
export function setupEventListeners(
  worker: SENDAttachmentUploadWorker,
  importer: Core.GOListImporter<SENDAttachmentUploadRow>,
  prompt: Core.GOPrompt,
): void {
  // Worker events
  worker.on('worker:progress', (event) => {
    const progress = event.progress;
    const msg = `[UPLOAD] Processed: ${progress.processedRows}, Uploaded: ${progress.uploadedFiles}, Failed: ${progress.failedRows}`;
    prompt.spin(PROGRESS_SPINNER_ID, `\x1b[36m>\x1b[0m ${msg}`);
  });

  worker.on('worker:file:uploaded', (event) => {
    prompt.spinLog(`\x1b[32mOK\x1b[0m Uploaded: ${event.upload.filePath} -> ${event.upload.fileKey}`);
  });

  worker.on('worker:error', (event) => {
    prompt.spinLog(
      `\x1b[31mX\x1b[0m Error at row ${event.error.rowIndex} [${event.error.phase}]: ${event.error.message}`,
    );
  });

  // Importer events
  importer.on('import:started', (event) => {
    prompt.spinLog(`Import started: ${event.source}`);
  });

  importer.on('import:completed', (event) => {
    prompt.spinLog(`Input read completed: ${event.totalItems} valid rows, ${event.invalidItems} invalid`);
  });
}
