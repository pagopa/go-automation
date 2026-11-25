/** A read that returned no rows because it failed, kept in the result when `partialResults` is set. */
export interface AWSCloudWatchLogsFailedRead {
  /** Log groups the failed read covered. */
  readonly logGroups: ReadonlyArray<string>;
  /** Error of the last attempt, as it would have been thrown without `partialResults`. */
  readonly error: Error;
}
