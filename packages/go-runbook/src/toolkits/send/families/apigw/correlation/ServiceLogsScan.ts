import type { TraceIdCandidateMatch } from '../../../../common/parsing/traceIds/TraceIdCandidateMatch.js';
import type { KnownUrlInLogs } from './KnownUrlInLogs.js';

/**
 * Aggregated outcome of a single pass over a service's CloudWatch Logs
 * result set. Bundles the four projections the API Gateway analysis loop
 * needs so the rows are walked once instead of four-to-six times.
 */
export interface ServiceLogsScan {
  /** Most representative error message (empty string when none). */
  readonly errorMessage: string;
  /** First known URL in the strongest failure evidence, falling back to other rows. */
  readonly knownUrl: KnownUrlInLogs | undefined;
  /** UUID associated with the selected URL; first token when no URL is selected. */
  readonly fallbackUuid: string | undefined;
  /** First valid trace id candidate, or `undefined`. */
  readonly traceIdCandidate: TraceIdCandidateMatch | undefined;
}
