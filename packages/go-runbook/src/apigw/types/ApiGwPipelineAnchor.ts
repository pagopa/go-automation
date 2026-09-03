/**
 * Points of the canonical API Gateway pipeline where a runbook can splice a
 * custom step.
 *
 * Named after what has already happened, not after an ordinal: the pipeline has
 * conditional sections (authorizer gate, execution log) and an ordinal would go
 * stale the moment one of them is added.
 */
export type ApiGwPipelineAnchor =
  /** After the AccessLog parse, the authorizer gate and the execution-log branch, before the first service is queried. */
  | 'before-service-traversal'
  /** After the entry service has been queried and analysed, before its traversal decision. */
  | 'after-entry-analysis';
