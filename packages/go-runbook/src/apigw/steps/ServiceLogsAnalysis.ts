/**
 * Outcome of a microservice log analysis performed by
 * {@link analyzeServiceLogs}.
 */
export interface ServiceLogsAnalysis {
  /** Longest "error-like" message found across the result rows. */
  readonly errorMessage: string;
  /** Total number of rows returned by the upstream query. */
  readonly logCount: number;
  /** Observed URL that matched the {@link KnownUrlsRegistry}, if any. */
  readonly knownUrl: string | undefined;
  /** Target name (service or downstream) attached to the matched URL. */
  readonly knownUrlTarget: string | undefined;
  /** Fallback UUID extracted when a known downstream URL was also found. */
  readonly fallbackUuidExtracted: string | undefined;
  /** Fresh trace id found in logs after a fallback-UUID query, if any. */
  readonly freshTraceId: string | undefined;
  /** Raw trace id value before canonical X-Ray formatting, if any. */
  readonly freshTraceIdRaw: string | undefined;
}
