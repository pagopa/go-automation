import type { TreeExclusion } from '../../../../../engine/types/TreeExclusion.js';

/**
 * Descriptor of a microservice analysed by an API Gateway alarm runbook.
 *
 * The mapping `name → logGroup` lives inline on the descriptor so each
 * runbook stays self-contained; consumers cannot accidentally pick up the
 * wrong log group from an external table.
 *
 * In the dynamic API Gateway pipeline the {@link name} doubles as the
 * routing key: a {@link KnownUrl} whose `target` equals this `name`
 * makes an error that calls it descend to this service.
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
   * the read of the service can inject the predicates of its identifiers.
   */
  readonly queryOverride?: string;
  /**
   * Diagnoses a case of the caller may require to be absent from the whole read of this service for it, published
   * on the caller as `<varPrefix>Exclusion.<name>`.
   */
  readonly exclusions?: ReadonlyArray<TreeExclusion>;
}
