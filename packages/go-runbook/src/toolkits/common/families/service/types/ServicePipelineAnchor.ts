/**
 * Points of the canonical application-log pipeline where a runbook can splice a
 * custom step. See {@link PipelineHook}.
 */
export type ServicePipelineAnchor = 'after-service-scan' | 'after-service-analysis';
