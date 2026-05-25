/**
 * Terminal-positive outcome: the polled state has reached a successful end.
 * The wrapped `value` is returned to the caller of `GOPoller.poll()`.
 */
export interface GOPollDecisionSuccess<T> {
  readonly type: 'success';
  readonly value: T;
}
