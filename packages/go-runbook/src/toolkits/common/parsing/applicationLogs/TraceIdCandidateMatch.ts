/** Trace id candidate observed in application logs. */
export interface TraceIdCandidateMatch {
  /** Raw token as it appeared in the log row (32 hex chars or canonical). */
  readonly raw: string;
  /** Canonical X-Ray form (`1-XXXXXXXX-...`). */
  readonly canonical: string;
}
