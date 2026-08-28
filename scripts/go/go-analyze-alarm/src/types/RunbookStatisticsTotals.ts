/**
 * Catalog-wide totals of the local runbook registry.
 */
export interface RunbookStatisticsTotals {
  /** Runbooks registered in the catalog */
  readonly runbooks: number;
  /** Distinct CloudWatch alarm names routed to a runbook */
  readonly alarms: number;
  /** Known cases declared across every runbook */
  readonly knownCases: number;
  /** Known cases carrying analysis directives */
  readonly annotatedKnownCases: number;
  /** Steps declared across every runbook */
  readonly steps: number;
  /** Runbooks declaring no known case (they can only produce a fallback) */
  readonly runbooksWithoutKnownCases: number;
  /** Runbooks routed by more than one alarm name */
  readonly runbooksWithMultipleAlarms: number;
}
