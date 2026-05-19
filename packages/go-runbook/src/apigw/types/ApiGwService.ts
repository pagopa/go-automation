/**
 * Descriptor of a microservice analysed by an API Gateway alarm runbook.
 *
 * The mapping `name → logGroup` lives inline on the descriptor so each
 * runbook stays self-contained; consumers cannot accidentally pick up the
 * wrong log group from an external table.
 *
 * In the dynamic API Gateway pipeline the {@link name} doubles as the
 * routing key: a {@link KnownUrl} whose `target` equals this `name`
 * causes the analysis loop to enter this service.
 */
export interface ApiGwService {
  /** Canonical microservice name (e.g. `pn-user-attributes`). */
  readonly name: string;
  /** CloudWatch Logs group hosting the microservice application logs. */
  readonly logGroup: string;
  /**
   * Optional API Gateway execution log group associated with the entry
   * path for this service.
   *
   * Used before the X-Ray flow when API Gateway AccessLog already
   * contains a non-empty `errorMessage`: in that case requestId-based
   * execution-log analysis takes precedence over microservice tracing.
   */
  readonly executionLogGroup?: string;
  /**
   * Prefix used for the context vars produced by the analysis step.
   *
   * Example: `userAttributes` yields `userAttributesErrorMsg`,
   * `userAttributesLogCount`, `userAttributesNextUrl`, …
   */
  readonly varPrefix: string;
  /**
   * Optional override of the query template (rare, advanced usage).
   * Must contain the `{{FILTER_CLAUSE}}` placeholder so that
   * {@link queryServiceLogs} can inject the runtime filter clauses.
   */
  readonly queryOverride?: string;
}
