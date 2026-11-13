import type { ApiGwTerminationReason } from '../types/ApiGwTerminationReason.js';
import type { ApiGwReporterServiceSummary } from './ApiGwReporterServiceSummary.js';

/**
 * Termination payload assembled by `DecideNextStep` and rendered by the
 * reporter once the analysis loop exits.
 */
export interface ApiGwReporterTermination {
  readonly reason: ApiGwTerminationReason;
  /**
   * IDs of every known case the engine matched, sorted by priority
   * descending (`matchedCaseIds[0]` is the primary). Empty when the
   * termination is not a `known-case`.
   */
  readonly matchedCaseIds: ReadonlyArray<string>;
  readonly downstreamTarget?: string;
  readonly errorMessage?: string;
  readonly servicesVisited: ReadonlyArray<ApiGwReporterServiceSummary>;
}
