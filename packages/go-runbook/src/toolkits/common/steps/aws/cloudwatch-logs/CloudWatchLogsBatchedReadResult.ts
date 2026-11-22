import type { ExecutedCloudWatchLogsQuery } from './ExecutedCloudWatchLogsQuery.js';

/** The reads of the batches that answered, merged, with the errors of the batches that failed. */
export interface CloudWatchLogsBatchedReadResult extends ExecutedCloudWatchLogsQuery {
  readonly failures: ReadonlyArray<Error>;
}
