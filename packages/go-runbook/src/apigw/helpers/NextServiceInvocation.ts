/**
 * Result of a next-service-invocation scan on a microservice log result set.
 *
 * Captures the next downstream service name and the X-Ray trace id observed
 * for that invocation, so the runbook can continue the chain analysis.
 */
export interface NextServiceInvocation {
  /** Name of the next microservice invoked (e.g. `pn-external-registries`) */
  readonly service: string;
  /** X-Ray trace id for the next invocation */
  readonly traceId: string;
}
