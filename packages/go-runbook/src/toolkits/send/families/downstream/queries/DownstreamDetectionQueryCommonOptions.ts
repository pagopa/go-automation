export interface DownstreamDetectionQueryCommonOptions {
  /**
   * Also require `level = 'ERROR'`, as the `matchAnyService` variant always
   * does. For alarms whose metric filter carries that predicate too, so the
   * runbook counts what the alarm counted.
   *
   * Additive in both variants: it never removes the predicate from the generic
   * query, which carries it by contract.
   */
  readonly errorLevelOnly?: boolean;
  /** Maximum number of chronologically ordered rows returned by Logs Insights. */
  readonly resultLimit?: number;
  /**
   * Fields the query selects, in order; default `@timestamp, level, trace_id, message, @message`.
   * Leaving out `@message` keeps very large raw events out of the result.
   */
  readonly projection?: ReadonlyArray<string>;
}
