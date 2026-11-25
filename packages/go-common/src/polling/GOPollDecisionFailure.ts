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
  /**
   * Optional human-readable label (e.g. the upstream status string) intended
   * as metadata for the **check author**: a useful place to attach context
   * before returning the failure so the surrounding code (logs, breadcrumbs,
   * error wrapping at the call site) can pick it up.
   *
   * `GOPoller` does NOT log or emit this field — on `failure` it throws
   * `decision.error` transparently. If you need failure-time logging, do it
   * in the check itself before returning, or wrap `poller.poll()` in a
   * try/catch at the call site.
   */
  readonly reason?: string;
}
