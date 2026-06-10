/**
 * Display helpers for upload workflow results.
 */

import { Core } from '@go-automation/go-common';
import type { SENDAttachmentUploadWorkerResult, SENDAttachmentUploadWorkerError } from '@go-automation/go-send';

/**
 * Displays workflow results summary.
 *
 * @param script - The GOScript instance for logging
 * @param result - The upload worker result
 * @param outputFilePath - Path to the output file
 */
export function displayResults(
  script: Core.GOScript,
  result: SENDAttachmentUploadWorkerResult,
  outputFilePath: string,
): void {
  script.logger.newline();
  script.logger.section('Upload Results');

  const stats = [
    { label: 'Total rows', value: result.stats.totalRows },
    { label: 'Uploaded', value: result.stats.uploadedFiles },
    { label: 'Failed', value: result.stats.failedRows },
    { label: 'Stopped on error', value: result.stoppedOnError ? 'yes' : 'no' },
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

  script.logger.newline();
  script.logger.info(`Results written to: ${outputFilePath}`);

  if (result.errors && result.errors.length > 0) {
    script.logger.newline();
    script.logger.warning(`Errors encountered: ${result.errors.length}`);
    const errorsToShow: ReadonlyArray<SENDAttachmentUploadWorkerError> = result.errors.slice(0, 5);
    let errorIndex = 0;
    for (const error of errorsToShow) {
      errorIndex += 1;
      script.logger.error(`  ${errorIndex}. Row ${error.rowIndex} [${error.phase}]: ${error.message}`);
    }
    if (result.errors.length > 5) {
      script.logger.info(`  ... and ${result.errors.length - 5} more errors`);
    }
  }
}
