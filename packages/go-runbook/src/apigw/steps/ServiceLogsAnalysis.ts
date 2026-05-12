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
  /** Fallback UUID extracted from the logs during this analysis call. */
  readonly fallbackUuidExtracted: string | undefined;
}
