/**
 * Points of the canonical API Gateway pipeline where a runbook can splice a
 * custom step.
 *
 * Named after what has already happened, not after an ordinal: the pipeline has
 * conditional sections (authorizer gate, execution log) and an ordinal would go
 * stale the moment one of them is added.
 */
export type ApiGwPipelineAnchor =
  /** On each request: after the AccessLog parse, the authorizer gate and the execution log, before its descent. */
  | 'before-service-traversal'
  /** On each error of the entry service: before it descends to the service it calls. */
  | 'after-entry-analysis'
  /** On each request, once the entry service has been read for it: `<prefix>LookupState` and `<prefix>LogCount` known. */
  | 'after-entry-read';
