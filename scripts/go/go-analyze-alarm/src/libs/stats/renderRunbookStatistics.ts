/**
 * Console rendering of the offline runbook statistics.
 *
 * Presentation only: every figure comes from the report, nothing is recomputed
 * here beyond percentages and averages.
 */

import type { Core } from '@go-automation/go-common';

import type { RunbookCatalogEntry } from '../../types/RunbookCatalogEntry.js';
import type { RunbookStatisticsBucket } from '../../types/RunbookStatisticsBucket.js';
import type { RunbookStatisticsReport } from '../../types/RunbookStatisticsReport.js';

/** How many tags are listed in the "Top Tags" section. */
const TOP_TAG_COUNT = 10;

/** Upper bounds of the auto-sized columns of the detail table. */
const MAX_KEY_COLUMN_WIDTH = 64;
const MAX_CATEGORIES_COLUMN_WIDTH = 30;

/** Spaces reserved around a cell value when auto-sizing a column. */
const CELL_PADDING = 2;

/** Rendering options of the statistics report. */
export interface RenderRunbookStatisticsOptions {
  /** Print the per-runbook detail table */
  readonly detail: boolean;
}

/**
 * Prints the whole statistics report to the console.
 *
 * @param logger - Logger used for sections and tables
 * @param report - Report produced by `computeRunbookStatistics`
 * @param options - Rendering options
 *
 * @example
 * ```typescript
 * renderRunbookStatistics(script.logger, report, { detail: true });
 * ```
 */
export function renderRunbookStatistics(
  logger: Core.GOLogger,
  report: RunbookStatisticsReport,
  options: RenderRunbookStatisticsOptions,
): void {
  renderTotals(logger, report);
  renderBucketSection(logger, 'By Product', 'Product', report.byProduct, report.totals.runbooks);
  renderBucketSection(logger, 'By Kind', 'Kind', report.byKind, report.totals.runbooks);
  renderMatrix(logger, report);
  renderCategories(logger, report);
  renderTags(logger, report);
  if (options.detail) renderDetail(logger, report.entries);
}

function renderTotals(logger: Core.GOLogger, report: RunbookStatisticsReport): void {
  const { totals } = report;
  logger.section('Runbook Catalog Statistics');
  logger.info('Source: local registry (offline) — no AWS, no Watchtower');
  logger.info(`Generated at: ${report.generatedAt}`);

  logger.table({
    columns: [
      { header: 'Metric', key: 'metric', width: 28 },
      { header: 'Value', key: 'value', width: 16, align: 'right' },
    ],
    data: [
      { metric: 'Runbooks', value: totals.runbooks },
      { metric: 'Alarm names covered', value: totals.alarms },
      { metric: 'Known cases', value: totals.knownCases },
      {
        metric: 'Known cases annotated',
        value: `${String(totals.annotatedKnownCases)} (${formatShare(totals.annotatedKnownCases, totals.knownCases)})`,
      },
      { metric: 'Steps', value: totals.steps },
      { metric: 'Runbooks w/o known cases', value: totals.runbooksWithoutKnownCases },
      { metric: 'Multi-alarm runbooks', value: totals.runbooksWithMultipleAlarms },
      { metric: 'Avg cases / runbook', value: formatAverage(totals.knownCases, totals.runbooks) },
      { metric: 'Avg steps / runbook', value: formatAverage(totals.steps, totals.runbooks) },
    ],
  });
}

function renderBucketSection(
  logger: Core.GOLogger,
  title: string,
  header: string,
  buckets: ReadonlyArray<RunbookStatisticsBucket>,
  totalRunbooks: number,
): void {
  logger.section(title);
  logger.table({
    columns: [
      { header, key: 'label', width: 20 },
      { header: 'Runbooks', key: 'runbooks', width: 10, align: 'right' },
      { header: 'Share', key: 'share', width: 8, align: 'right' },
      { header: 'Alarms', key: 'alarms', width: 8, align: 'right' },
      { header: 'Cases', key: 'cases', width: 8, align: 'right' },
      { header: 'Steps', key: 'steps', width: 8, align: 'right' },
    ],
    data: buckets.map((bucket) => ({
      label: bucket.label,
      runbooks: bucket.runbooks,
      share: formatShare(bucket.runbooks, totalRunbooks),
      alarms: bucket.alarms,
      cases: bucket.knownCases,
      steps: bucket.steps,
    })),
  });
}

function renderMatrix(logger: Core.GOLogger, report: RunbookStatisticsReport): void {
  const kinds = [...report.byKind].map((bucket) => bucket.label).sort((left, right) => left.localeCompare(right));
  const products = report.byProduct.map((bucket) => bucket.label);

  const counts = new Map<string, number>();
  for (const cell of report.productKindMatrix) counts.set(`${cell.product}/${cell.kind}`, cell.runbooks);

  const rows = products.map((product) => {
    const row: Record<string, unknown> = { product };
    let total = 0;
    for (const kind of kinds) {
      const value = counts.get(`${product}/${kind}`) ?? 0;
      row[kind] = value;
      total += value;
    }
    row['total'] = total;
    return row;
  });

  const totalRow: Record<string, unknown> = { product: 'Total' };
  for (const kind of kinds) {
    totalRow[kind] = report.byKind.find((bucket) => bucket.label === kind)?.runbooks ?? 0;
  }
  totalRow['total'] = report.totals.runbooks;

  logger.section('Product x Kind');
  logger.table({
    columns: [
      { header: 'Product', key: 'product', width: 20 },
      ...kinds.map((kind) => ({ header: kind, key: kind, width: 10, align: 'right' as const })),
      { header: 'Total', key: 'total', width: 8, align: 'right' as const },
    ],
    data: [...rows, totalRow],
  });
}

function renderCategories(logger: Core.GOLogger, report: RunbookStatisticsReport): void {
  const assignments = report.byCategory.reduce((sum, bucket) => sum + bucket.runbooks, 0);
  renderBucketSection(logger, 'By Category', 'Category', report.byCategory, report.totals.runbooks);
  if (assignments !== report.totals.runbooks) {
    logger.info(
      `Categories overlap: ${String(assignments)} assignments over ${String(report.totals.runbooks)} runbooks ` +
        '(shares do not sum to 100%)',
    );
  }
}

function renderTags(logger: Core.GOLogger, report: RunbookStatisticsReport): void {
  logger.section('Top Tags');
  logger.table({
    columns: [
      { header: 'Tag', key: 'label', width: 30 },
      { header: 'Runbooks', key: 'runbooks', width: 10, align: 'right' },
      { header: 'Alarms', key: 'alarms', width: 8, align: 'right' },
    ],
    data: report.byTag.slice(0, TOP_TAG_COUNT).map((bucket) => ({
      label: bucket.label,
      runbooks: bucket.runbooks,
      alarms: bucket.alarms,
    })),
  });
  logger.info(`Distinct tags: ${String(report.byTag.length)}`);
}

function renderDetail(logger: Core.GOLogger, entries: ReadonlyArray<RunbookCatalogEntry>): void {
  const rows = entries.map((entry) => ({
    key: entry.key,
    product: entry.product,
    kind: entry.kind,
    categories: entry.categories.join(', '),
    alarms: entry.alarmNames.length,
    steps: entry.stepCount,
    cases: entry.knownCaseCount,
  }));

  logger.section('Runbook Detail');
  logger.table({
    columns: [
      {
        header: 'Runbook',
        key: 'key',
        width: columnWidth(
          rows.map((row) => row.key),
          20,
          MAX_KEY_COLUMN_WIDTH,
        ),
      },
      { header: 'Product', key: 'product', width: 9 },
      { header: 'Kind', key: 'kind', width: 9 },
      {
        header: 'Categories',
        key: 'categories',
        width: columnWidth(
          rows.map((row) => row.categories),
          12,
          MAX_CATEGORIES_COLUMN_WIDTH,
        ),
      },
      { header: 'Alarms', key: 'alarms', width: 8, align: 'right' },
      { header: 'Steps', key: 'steps', width: 7, align: 'right' },
      { header: 'Cases', key: 'cases', width: 7, align: 'right' },
    ],
    data: rows,
  });
  logger.info(`Rows: ${String(entries.length)}`);
}

/**
 * Width that fits the longest value, clamped between `min` and `max`.
 * Keeps the detail table readable without hard-coding the current catalog size.
 */
function columnWidth(values: ReadonlyArray<string>, min: number, max: number): number {
  const longest = values.reduce((width, value) => Math.max(width, value.length), 0);
  return Math.min(Math.max(longest + CELL_PADDING, min), max);
}

/** Formats `value / total` as a percentage with one decimal; `n/a` when there is no total. */
function formatShare(value: number, total: number): string {
  if (total === 0) return 'n/a';
  return `${((value / total) * 100).toFixed(1)}%`;
}

/** Formats `value / count` with one decimal; `0.0` when there is nothing to divide by. */
function formatAverage(value: number, count: number): string {
  if (count === 0) return '0.0';
  return (value / count).toFixed(1);
}
