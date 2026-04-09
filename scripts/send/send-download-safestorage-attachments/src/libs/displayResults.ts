/**
 * Display helpers for download result summaries.
 */

import { Core } from '@go-automation/go-common';

import type { DownloadResult } from '../types/DownloadResult.js';

/**
 * Displays a summary table of the download results.
 *
 * @param script - GOScript for logging
 * @param results - Download results to summarize
 * @param reportPath - Path where the JSONL report was saved
 */
export function displayResults(
  script: Core.GOScript,
  results: ReadonlyArray<DownloadResult>,
  reportPath: string,
): void {
  script.logger.newline();
  script.logger.section('Download Results');

  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  const stats = [
    { label: 'Total attachments', value: results.length },
    { label: 'Downloaded', value: successful },
    { label: 'Failed', value: failed },
    { label: 'Report', value: reportPath },
  ];

  script.logger.table({
    columns: [
      { header: 'Metric', key: 'label' },
      { header: 'Value', key: 'value' },
    ],
    data: stats,
    border: true,
  });

  if (failed > 0) {
    script.logger.newline();
    script.logger.warning(`${failed} download(s) failed:`);
    for (const r of results.filter((res) => !res.success)) {
      script.logger.error(`  - ${r.key}: ${r.error ?? 'unknown error'}`);
    }
  }
}
