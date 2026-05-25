/**
 * Terminal-negative outcome: the polled state has reached an unrecoverable
 * end (e.g. Athena query FAILED, IUN polling REFUSED).
 *
 * The `error` is **propagated transparently** by the poller — it keeps its
 * original type so callers can `instanceof` against domain-specific error
 * classes. The poller does NOT wrap it in `GOPollingError`; only
 * infrastructure faults (timeout / abort / budget) become `GOPollingError`.
 *
 * Distinct from a thrown exception inside the check: a `failure` is a
 * modelled decision (expected terminal failure), a throw is an unexpected
 * fault (bug, network glitch in the probe).
 */
export interface GOPollDecisionFailure<E extends Error = Error> {
  readonly type: 'failure';
  readonly error: E;
  /** Optional human-readable reason (logged before throwing). */
  readonly reason?: string;
}
