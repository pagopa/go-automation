/**
 * Pure aggregation of the local runbook catalog.
 *
 * No I/O, no clock: the timestamp is injected, so the same entries always
 * produce the same report and the function is trivially testable.
 */

import type { RunbookCatalogEntry } from '../../types/RunbookCatalogEntry.js';
import type { RunbookStatisticsBucket } from '../../types/RunbookStatisticsBucket.js';
import type { RunbookStatisticsMatrixCell } from '../../types/RunbookStatisticsMatrixCell.js';
import type { RunbookStatisticsReport } from '../../types/RunbookStatisticsReport.js';
import type { RunbookStatisticsTotals } from '../../types/RunbookStatisticsTotals.js';

/** Separator for the composite product/kind key; neither value contains it. */
const MATRIX_KEY_SEPARATOR = '\u0000';

interface MutableBucket {
  runbooks: number;
  alarms: number;
  knownCases: number;
  steps: number;
}

/**
 * Aggregates catalog entries into the statistics report.
 *
 * Every grouping is filled in a single pass over the entries, accumulating in
 * `Map`s keyed by grouping value: O(N × G) where G is the small, bounded number
 * of labels an entry contributes (1 product, 1 kind, its categories, its tags).
 *
 * Categories and tags are multi-valued, so a runbook contributes to several
 * buckets: those counts intentionally do not sum to the catalog total.
 *
 * @param entries - Catalog entries to aggregate
 * @param generatedAt - ISO 8601 timestamp recorded in the report
 * @returns The aggregated report, buckets sorted by descending runbook count
 *
 * @example
 * ```typescript
 * const report = computeRunbookStatistics(entries, new Date().toISOString());
 * console.log(report.totals.runbooks, report.byProduct[0]?.label);
 * ```
 */
export function computeRunbookStatistics(
  entries: ReadonlyArray<RunbookCatalogEntry>,
  generatedAt: string,
): RunbookStatisticsReport {
  const byProduct = new Map<string, MutableBucket>();
  const byKind = new Map<string, MutableBucket>();
  const byCategory = new Map<string, MutableBucket>();
  const byTag = new Map<string, MutableBucket>();
  const matrix = new Map<string, MutableBucket>();
  const distinctAlarms = new Set<string>();

  let knownCases = 0;
  let annotatedKnownCases = 0;
  let steps = 0;
  let runbooksWithoutKnownCases = 0;
  let runbooksWithMultipleAlarms = 0;

  for (const entry of entries) {
    for (const alarmName of entry.alarmNames) distinctAlarms.add(alarmName);
    knownCases += entry.knownCaseCount;
    annotatedKnownCases += entry.annotatedKnownCaseCount;
    steps += entry.stepCount;
    if (entry.knownCaseCount === 0) runbooksWithoutKnownCases += 1;
    if (entry.alarmNames.length > 1) runbooksWithMultipleAlarms += 1;

    accumulate(byProduct, entry.product, entry);
    accumulate(byKind, entry.kind, entry);
    accumulate(matrix, `${entry.product}${MATRIX_KEY_SEPARATOR}${entry.kind}`, entry);
    for (const category of entry.categories) accumulate(byCategory, category, entry);
    for (const tag of entry.tags) accumulate(byTag, tag, entry);
  }

  const totals: RunbookStatisticsTotals = {
    runbooks: entries.length,
    alarms: distinctAlarms.size,
    knownCases,
    annotatedKnownCases,
    steps,
    runbooksWithoutKnownCases,
    runbooksWithMultipleAlarms,
  };

  return {
    generatedAt,
    totals,
    byProduct: toBuckets(byProduct),
    byKind: toBuckets(byKind),
    byCategory: toBuckets(byCategory),
    byTag: toBuckets(byTag),
    productKindMatrix: toMatrixCells(matrix),
    entries,
  };
}

/** Adds one entry to the bucket identified by `label`, creating it when needed. */
function accumulate(buckets: Map<string, MutableBucket>, label: string, entry: RunbookCatalogEntry): void {
  const bucket = buckets.get(label);
  if (bucket === undefined) {
    buckets.set(label, {
      runbooks: 1,
      alarms: entry.alarmNames.length,
      knownCases: entry.knownCaseCount,
      steps: entry.stepCount,
    });
    return;
  }
  bucket.runbooks += 1;
  bucket.alarms += entry.alarmNames.length;
  bucket.knownCases += entry.knownCaseCount;
  bucket.steps += entry.stepCount;
}

/** Freezes the accumulators, sorted by descending runbook count then by label. */
function toBuckets(buckets: ReadonlyMap<string, MutableBucket>): ReadonlyArray<RunbookStatisticsBucket> {
  return [...buckets]
    .map(([label, bucket]) => ({
      label,
      runbooks: bucket.runbooks,
      alarms: bucket.alarms,
      knownCases: bucket.knownCases,
      steps: bucket.steps,
    }))
    .sort((left, right) => right.runbooks - left.runbooks || left.label.localeCompare(right.label));
}

/** Splits the composite keys back into product/kind cells, sorted for stable output. */
function toMatrixCells(matrix: ReadonlyMap<string, MutableBucket>): ReadonlyArray<RunbookStatisticsMatrixCell> {
  const cells: RunbookStatisticsMatrixCell[] = [];
  for (const [key, bucket] of matrix) {
    const [product = '', kind = ''] = key.split(MATRIX_KEY_SEPARATOR);
    cells.push({ product, kind, runbooks: bucket.runbooks, alarms: bucket.alarms });
  }
  return cells.sort((left, right) => left.product.localeCompare(right.product) || left.kind.localeCompare(right.kind));
}
