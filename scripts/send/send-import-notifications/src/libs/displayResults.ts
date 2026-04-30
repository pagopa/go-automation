/**
 * Display helpers for import workflow results.
 */

import { Core } from '@go-automation/go-common';
import type { SENDNotificationImportWorkerResult, SENDNotificationImportWorkerError } from '@go-automation/go-send';

/**
 * Displays workflow results summary.
 *
 * @param script - The GOScript instance for logging
 * @param result - The import worker result
 * @param exportFilePath - Path to the export file (optional)
 */
export function displayResults(
  script: Core.GOScript,
  result: SENDNotificationImportWorkerResult,
  exportFilePath?: string,
): void {
  script.logger.newline();
  script.logger.section('Workflow Results');

  const stats = [
    { label: 'Total rows', value: result.stats.totalRows },
    { label: 'Processed', value: result.stats.processedRows },
    { label: 'Documents uploaded', value: result.stats.documentsUploaded },
    { label: 'Notifications sent', value: result.stats.notificationsSent },
    { label: 'IUNs obtained', value: result.stats.iunsObtained },
    { label: 'Failed', value: result.stats.failedRows },
    { label: 'Processing time', value: `${(result.stats.processingTime / 1000).toFixed(2)}s` },
  ];

  script.logger.table({
    columns: [
      { header: 'Metric', key: 'label' },
      { header: 'Value', key: 'value' },
    ],
    data: stats,
    border: true,
  });

  if (result.stats.iunsObtained > 0 && exportFilePath) {
    script.logger.newline();
    script.logger.info(`Exported ${result.stats.iunsObtained} notifications to: ${exportFilePath}`);
  }

  if (result.errors && result.errors.length > 0) {
    script.logger.newline();
    script.logger.warning(`Errors encountered: ${result.errors.length}`);
    const errorsToShow: ReadonlyArray<SENDNotificationImportWorkerError> = result.errors.slice(0, 5);
    let errorIndex = 0;
    for (const error of errorsToShow) {
      errorIndex += 1;
      script.logger.error(`  ${errorIndex}. Row ${error.rowIndex} [${error.type}]: ${error.message}`);
    }
    if (result.errors.length > 5) {
      script.logger.info(`  ... and ${result.errors.length - 5} more errors`);
    }
  }

  if (result.sentNotifications.length > 0) {
    script.logger.newline();
    script.logger.info(`Sent ${result.sentNotifications.length} notifications`);
  }
}
