import type { TimeRangeFromParams } from '../../../steps/data/TimeRangeFromParams.js';

/** The k8s application-log side of the pipeline. */
export interface InteropApiGwApplicationLogConfig {
  /** Pod app under analysis; also the primary analysis resource. */
  readonly serviceName: string;
  /** Application log group template, surfaced in `runbookContext`. */
  readonly logGroupTemplate: string;
  /** Prefix of the context vars the analysis writes. */
  readonly varPrefix: string;
  /**
   * Value the query filters `pod_app` on, when it is not {@link serviceName}.
   * The auth-server pods are named `…-node` but the filter matches the
   * broader `…-authorization-server` family.
   */
  readonly podAppFilter?: string;
  /**
   * Time range for the application query, when it differs from the API
   * Gateway one — a warning scan may need to stop at the alarm instant.
   */
  readonly timeRangeFromParams?: TimeRangeFromParams;
  /** Field carrying the row count, when the query aggregates. */
  readonly countField?: string;
  /** Label rendered for the application-log rows. */
  readonly label?: string;
}
