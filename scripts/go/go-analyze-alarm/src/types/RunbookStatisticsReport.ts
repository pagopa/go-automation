import type { RunbookCatalogEntry } from './RunbookCatalogEntry.js';
import type { RunbookStatisticsBucket } from './RunbookStatisticsBucket.js';
import type { RunbookStatisticsMatrixCell } from './RunbookStatisticsMatrixCell.js';
import type { RunbookStatisticsTotals } from './RunbookStatisticsTotals.js';

/**
 * Offline snapshot of the local runbook catalog.
 *
 * Every figure is derived from the registry shipped in this repository: the
 * report is reproducible, requires no credentials and no remote system.
 *
 * Buckets are sorted by descending runbook count, then by label. In
 * {@link byCategory} and {@link byTag} a runbook can appear in several buckets,
 * so those counts do not sum to {@link RunbookStatisticsTotals.runbooks}.
 */
export interface RunbookStatisticsReport {
  /** ISO 8601 timestamp of the snapshot */
  readonly generatedAt: string;
  /** Catalog-wide totals */
  readonly totals: RunbookStatisticsTotals;
  /** Runbooks grouped by product (`SEND`, `INTEROP`) */
  readonly byProduct: ReadonlyArray<RunbookStatisticsBucket>;
  /** Runbooks grouped by kind (`APIGW`, `LAMBDA`, `SERVICE`) */
  readonly byKind: ReadonlyArray<RunbookStatisticsBucket>;
  /** Runbooks grouped by functional category (overlapping) */
  readonly byCategory: ReadonlyArray<RunbookStatisticsBucket>;
  /** Runbooks grouped by tag (overlapping) */
  readonly byTag: ReadonlyArray<RunbookStatisticsBucket>;
  /** Product × kind cross tabulation */
  readonly productKindMatrix: ReadonlyArray<RunbookStatisticsMatrixCell>;
  /** The catalog entries the report was computed from */
  readonly entries: ReadonlyArray<RunbookCatalogEntry>;
}
