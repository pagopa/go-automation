/**
 * Descriptor of a microservice analysed by an API Gateway alarm runbook.
 *
 * The mapping `name → logGroup` lives inline on the descriptor so each
 * runbook stays self-contained; consumers cannot accidentally pick up the
 * wrong log group from an external table.
 */
export interface ApiGwService {
  /** Canonical microservice name (e.g. `pn-user-attributes`) */
  readonly name: string;
  /** CloudWatch Logs group hosting the microservice application logs */
  readonly logGroup: string;
  /**
   * Prefix used for the context vars produced by the analysis step.
   *
   * Example: `userAttributes` yields `userAttributesErrorMsg`,
   * `userAttributesLogCount`, `userAttributesNextUrl`, …
   */
  readonly varPrefix: string;
  /**
   * When `true`, the analysis step also scans for a next-service
   * invocation pattern. Default: `false`.
   */
  readonly detectNextService?: boolean;
  /**
   * When `true`, both the query and the analysis tolerate failures
   * without interrupting the runbook. The factory applies the convention
   * `false` for the first service in the list and `true` for the rest.
   */
  readonly continueOnFailure?: boolean;
  /**
   * Optional override of the query template (rare, advanced usage).
   * Must contain the `{{FILTER_CLAUSE}}` placeholder so that
   * {@link queryServiceLogs} can inject the runtime filter clauses.
   */
  readonly queryOverride?: string;
}
