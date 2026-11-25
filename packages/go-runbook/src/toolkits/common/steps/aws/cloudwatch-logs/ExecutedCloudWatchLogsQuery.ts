import type { StepCoverage, StepDiagnostics } from '../../../../../engine/index.js';
import type { CloudWatchLogsRows } from './CloudWatchLogsRows.js';

/** Result of a Logs Insights read of a runbook step. */
export interface ExecutedCloudWatchLogsQuery {
  /** Rows of the physical queries and pages that answered, merged. */
  readonly rows: CloudWatchLogsRows;
  readonly diagnostics?: StepDiagnostics;
  /** Incomplete parts of the read (saturated queries, unread pages, failed reads); empty when it is complete. */
  readonly coverage: ReadonlyArray<StepCoverage>;
}
