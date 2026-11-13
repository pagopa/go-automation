/**
 * A time range used for querying CloudWatch logs and metrics.
 */
export interface TimeRange {
  /** Start of the time range */
  readonly start: Date;
  /** End of the time range */
  readonly end: Date;
}
