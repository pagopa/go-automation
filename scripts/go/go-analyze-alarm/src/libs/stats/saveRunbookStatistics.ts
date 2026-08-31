/**
 * Utility for persisting the offline runbook statistics report to disk.
 */

import { Core } from '@go-automation/go-common';

import type { RunbookStatisticsReport } from '../../types/RunbookStatisticsReport.js';

/** Base file name of the report; a product filter is appended to it. */
const REPORT_FILE_PREFIX = 'runbook-stats';

/**
 * Saves the statistics report as JSON in the script output directory.
 * File name: `runbook-stats.json`, or `runbook-stats-{product}.json` when the
 * report is restricted to a single product.
 *
 * @param script - The GOScript instance for path resolution and logging
 * @param report - Report to persist
 * @param product - Product filter applied to the report, when any
 * @returns Absolute path of the written file
 */
export async function saveRunbookStatistics(
  script: Core.GOScript,
  report: RunbookStatisticsReport,
  product?: string,
): Promise<string> {
  const normalized = product?.trim().toUpperCase();
  const suffix = normalized === undefined || normalized === '' ? '' : `-${normalized.toLowerCase()}`;
  const fileName = `${REPORT_FILE_PREFIX}${suffix}.json`;
  const reportPath = script.paths.resolvePathWithInfo(fileName, Core.GOPathType.OUTPUT).path;

  const exporter = new Core.GOJSONFileExporter({ outputPath: reportPath, pretty: true, indent: 2 });
  await exporter.export(report);

  script.logger.info(`Statistics report saved: ${reportPath}`);
  return reportPath;
}
