/**
 * Canonical classification of a Lambda invocation error, written to
 * `vars.lambdaErrorCategory` so runbook known cases can match on it.
 *
 * Priority order during classification:
 * `timeout` → `out-of-memory` → `throttle` → `downstream` →
 * `application-error` → `unknown`.
 */
export type LambdaErrorCategory =
  | 'timeout' // 'Status: timeout' | 'Task timed out'
  | 'out-of-memory' // 'OutOfMemory' | 'JavaScript heap out of memory' | 'signal: killed' | MaxMemoryUsed >= MemorySize
  | 'throttle' // 'Rate Exceeded' | 'TooManyRequestsException'
  | 'downstream' // 'External service <X> returned errors' | DownstreamErrorPattern match
  | 'application-error' // 'ERROR' | 'Exception' | 'Status: error'
  | 'unknown';
