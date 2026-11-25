/**
 * Rows that ended with the same error code, for the summary (§12.4).
 */
export interface FailureGroup {
  readonly code: string;
  readonly count: number;
  /** First row keys (at most the requested sample). */
  readonly rowKeys: ReadonlyArray<string>;
  /** Message of the first row. */
  readonly message: string;
}
