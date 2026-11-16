/**
 * Points of the canonical application-log pipeline where a runbook can splice a
 * custom step. See {@link PipelineHook}.
 */
export type ServicePipelineAnchor =
  /** After the service error query and its analysis, before the trace-id follow-up. */
  'after-service-analysis';
