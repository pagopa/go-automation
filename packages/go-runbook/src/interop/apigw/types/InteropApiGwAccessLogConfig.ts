/** The API Gateway access-log side of the pipeline. */
export interface InteropApiGwAccessLogConfig {
  /** Access log group template, surfaced in `runbookContext`. */
  readonly logGroupTemplate: string;
  /**
   * Profile advertised in `runbookContext`, which the output builders read.
   * Describes the runbook; not necessarily the profile of a single query.
   */
  readonly profileId: string;
}
