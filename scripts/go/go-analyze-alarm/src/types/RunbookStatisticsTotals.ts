/**
 * Catalog-wide totals of the local runbook registry.
 */
export interface RunbookStatisticsTotals {
  /** Runbooks registered in the catalog */
  readonly runbooks: number;
  /** Distinct CloudWatch alarm names routed to a runbook */
  readonly alarms: number;
  /** Known errors declared across every runbook */
  readonly knownErrors: number;
  /** Known errors carrying analysis directives */
  readonly annotatedKnownErrors: number;
  /** Steps declared across every runbook */
  readonly steps: number;
  /** Runbooks declaring no known error (they can only produce a fallback) */
  readonly runbooksWithoutKnownErrors: number;
  /** Runbooks routed by more than one alarm name */
  readonly runbooksWithMultipleAlarms: number;
}
