import type { TimeRangeFromParams } from '../../../time/TimeRangeFromParams.js';
import type { AccessLogSchema } from '../accessLog/AccessLogSchema.js';
import type { ExecutionLogSpec } from '../executionLog/ExecutionLogSpec.js';

/**
 * Configuration for {@link QueryApiGwExecutionLogsStep}.
 */
export interface QueryApiGwExecutionLogsConfig {
  /** Unique step identifier. */
  readonly id: string;
  /** Human-readable label. */
  readonly label: string;
  /** Step id of the API Gateway AccessLog query. */
  readonly fromStep: string;
  /** API Gateway execution log group to query when requestIds are found. */
  readonly executionLogGroup?: string;
  /** Minimum HTTP status code to include (default: 500). */
  readonly minStatusCode?: number;
  /** Mapping for the time-range parameters in the runbook context. */
  readonly timeRangeFromParams: TimeRangeFromParams;
  /**
   * Specification dell'execution log (dal profilo del prodotto).
   */
  readonly spec: ExecutionLogSpec;
  /**
   * Schema dell'AccessLog (per leggere i campi `requestId`, `path`,
   * `errorMessage`, `statusFields`, sentinels).
   */
  readonly accessLogSchema: AccessLogSchema;
  /**
   * Identificatore del profilo per i metadati di trace.
   */
  readonly queryProfileId: string;
  /**
   * Request ids per query, in place of `spec.maxRequestIds`: more request ids are read with more queries.
   */
  readonly maxRequestIdsOverride?: number;
}
