/**
 * Reason why the API Gateway analysis loop stopped.
 *
 * Written to the `terminationReason` context var by `DecideNextStep`
 * when the analysis cannot make further progress.
 *
 * - `known-case`: a known case matched against the collected vars (the
 *   engine records this via early resolution; included for completeness)
 * - `external-downstream`: a known URL pointed to a downstream out of the
 *   runbook scope; the analysis cannot follow further
 * - `no-match`: no known case and no known URL that can drive another
 *   service hop
 * - `loop-detected`: the next jump would re-enter a (service, identifiers)
 *   pair already visited; the loop guard short-circuited
 */
export type TerminationReason = 'known-case' | 'external-downstream' | 'no-match' | 'loop-detected';
