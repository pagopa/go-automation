/**
 * Link declared by a runbook, aligned with the Watchtower `LinkSchema`
 * (url ≤2000, name ≤255, type ≤50).
 */
export interface AnalysisLinkRef {
  /** Absolute http/https URL; build-time validation rejects anything else. */
  readonly url: string;
  readonly name?: string;
  readonly type?: string;
}
