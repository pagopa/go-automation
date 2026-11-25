import type { TimeRangeFromParams } from '../../../../common/time/TimeRangeFromParams.js';

/** How the pipeline reads the k8s application logs, when it differs from the default. */
export interface InteropApiGwApplicationLogConfig {
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
