/**
 * Outcome of a microservice log analysis performed by
 * {@link analyzeServiceLogs}.
 */
export interface ServiceLogsAnalysis {
  /** Longest "error-like" message found across the result rows */
  readonly errorMessage: string;
  /** Total number of rows returned by the upstream query */
  readonly logCount: number;
  /** Next downstream service name if detected, otherwise `undefined` */
  readonly nextService: string | undefined;
  /** Trace id associated with the next service invocation, if any */
  readonly nextTraceId: string | undefined;
}
