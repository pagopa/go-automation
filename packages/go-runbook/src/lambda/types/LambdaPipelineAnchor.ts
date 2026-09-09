/**
 * Points of the canonical Lambda pipeline where a runbook can splice a custom
 * step. See {@link PipelineHook}.
 */
export type LambdaPipelineAnchor =
  /** After the Lambda error scan and before the downstream queries. */
  'before-downstream-queries';
