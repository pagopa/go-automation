/**
 * A downstream microservice reachable from the entry Lambda.
 *
 * Unlike API Gateway runbooks (which reach downstreams via known URLs),
 * Lambda runbooks identify the downstream from the error message
 * (see {@link DownstreamErrorPattern}) and, when a `logGroup` is provided,
 * query it by the Lambda `requestId`.
 */
export interface LambdaDownstream {
  /** Canonical microservice name (must match a {@link DownstreamErrorPattern.target}). */
  readonly name: string;
  /**
   * CloudWatch Logs group of the downstream. When omitted, the downstream
   * is only classified/reported, not queried (the Lambda `requestId` may
   * not be propagated to its logs — see the runbook open points).
   */
  readonly logGroup?: string;
  /** Prefix used for the context vars produced by the downstream analysis. */
  readonly varPrefix: string;
}
