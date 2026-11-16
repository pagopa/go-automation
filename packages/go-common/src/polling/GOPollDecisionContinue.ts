/**
 * "Keep polling": the observed state is not terminal yet.
 *
 * Optional `reason` and `progress` are surfaced to `onAttempt` for telemetry,
 * letting the caller log structured updates ("state=RUNNING", "rowsScanned=12000")
 * without the poller needing to know the domain.
 */
export interface GOPollDecisionContinue {
  readonly type: 'continue';
  /** Short human-readable reason (e.g. "QUEUED", "RUNNING"). Logged via `onAttempt`. */
  readonly reason?: string;
  /** Structured progress payload (e.g. `{ rowsScanned: 12000 }`). Logged via `onAttempt`. */
  readonly progress?: Readonly<Record<string, unknown>>;
}
