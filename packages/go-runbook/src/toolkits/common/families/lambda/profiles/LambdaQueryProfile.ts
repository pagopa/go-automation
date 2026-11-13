/**
 * Query profile for Lambda alarm runbooks: bundles the error-scan query and
 * the requestId-flow query template for a given product. Kept minimal — the
 * Lambda log "schema" is just `@timestamp` / `@message`.
 *
 * The profile is identified in the built runbook by `queryProfileId`; its
 * signatures are product data and do not enter the definition digest.
 *
 * @see DEFAULT_LAMBDA_PROFILE for the generic instance.
 */
export interface LambdaQueryProfile {
  /** Canonical product identifier (`'send'`, ...). */
  readonly id: string;
  /** Query that scans the Lambda log group for errors/timeout/OOM. */
  readonly errorQuery: string;
  /** Query template that reconstructs the flow for `{{vars.lambdaRequestId}}`. */
  readonly invocationQueryTemplate: string;
  /** Messages that classify an invocation error as `downstream` (product signatures, e.g. SEND's `External service … returned errors`). */
  readonly downstreamSignatures: ReadonlyArray<RegExp>;
}
