/**
 * Aggregated counters for one grouping value (a product, a kind, a category…).
 */
export interface RunbookStatisticsBucket {
  /** Grouping value the counters refer to */
  readonly label: string;
  /** Runbooks falling in this bucket */
  readonly runbooks: number;
  /** Alarm names covered by those runbooks */
  readonly alarms: number;
  /** Known cases declared by those runbooks */
  readonly knownCases: number;
  /** Steps declared by those runbooks */
  readonly steps: number;
}
