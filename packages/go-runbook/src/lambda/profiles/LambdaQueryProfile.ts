/**
 * Query profile for Lambda alarm runbooks: bundles the error-scan query and
 * the requestId-flow query template for a given product. Kept minimal — the
 * Lambda log "schema" is just `@timestamp` / `@message`.
 *
 * @see SEND_LAMBDA_PROFILE for the reference instance.
 */
export interface LambdaQueryProfile {
  /** Canonical product identifier (`'send'`, ...). */
  readonly id: string;
  /** Query that scans the Lambda log group for errors/timeout/OOM. */
  readonly errorQuery: string;
  /** Query template that reconstructs the flow for `{{vars.lambdaRequestId}}`. */
  readonly invocationQueryTemplate: string;
}
