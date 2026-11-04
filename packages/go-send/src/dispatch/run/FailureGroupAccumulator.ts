/**
 * Rows of one error code collected by `groupFailures` before sorting.
 * Mutable on purpose: it lives only inside one call.
 */
export interface FailureGroupAccumulator {
  count: number;
  readonly rowKeys: string[];
  readonly message: string;
}
