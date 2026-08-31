/**
 * `analysis.mode=stats`: offline statistics of the local runbook catalog.
 *
 * Reads the registry shipped in this repository and prints aggregated figures.
 * It never contacts AWS or Watchtower, so it needs no profile and no credential.
 */

import type { Core } from '@go-automation/go-common';

import type { GoAnalyzeAlarmConfig } from '../types/GoAnalyzeAlarmConfig.js';
import { collectRunbookCatalogEntries } from './stats/collectRunbookCatalogEntries.js';
import { computeRunbookStatistics } from './stats/computeRunbookStatistics.js';
import { filterRunbookEntriesByProduct, listRunbookEntryProducts } from './stats/filterRunbookEntriesByProduct.js';
import { renderRunbookStatistics } from './stats/renderRunbookStatistics.js';
import { saveRunbookStatistics } from './stats/saveRunbookStatistics.js';

/**
 * Runs the statistics mode end to end: collect, filter, aggregate, render and
 * optionally persist.
 *
 * @param script - The GOScript instance for logging and path resolution
 * @param config - Validated script configuration
 */
export async function runStatsMode(script: Core.GOScript, config: GoAnalyzeAlarmConfig): Promise<void> {
  const entries = collectRunbookCatalogEntries();
  if (entries.length === 0) {
    script.logger.warning('The local runbook catalog is empty: nothing to report.');
    return;
  }

  const selected = filterRunbookEntriesByProduct(entries, config.statsProduct);
  if (selected.length === 0) {
    script.logger.error(
      `No runbook found for product "${config.statsProduct ?? ''}". ` +
        `Available products: ${listRunbookEntryProducts(entries).join(', ')}`,
    );
    return;
  }

  const report = computeRunbookStatistics(selected, new Date().toISOString());
  renderRunbookStatistics(script.logger, report, { detail: config.statsDetail });

  if (config.statsSave) {
    await saveRunbookStatistics(script, report, config.statsProduct);
  }
}
