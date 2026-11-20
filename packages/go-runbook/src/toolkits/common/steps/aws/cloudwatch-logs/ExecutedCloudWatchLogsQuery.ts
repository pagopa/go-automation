import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { StepDiagnostics } from '../../../../../engine/tracing/StepDiagnostics.js';
import type { StepCoverage } from '../../../../../engine/types/StepCoverage.js';

/** Result of a Logs Insights read of a runbook step. */
export interface ExecutedCloudWatchLogsQuery {
  /** Rows of the physical queries and pages that answered, merged. */
  readonly rows: ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;
  readonly diagnostics?: StepDiagnostics;
  /** Incomplete parts of the read (saturated queries, unread pages, failed reads); empty when it is complete. */
  readonly coverage: ReadonlyArray<StepCoverage>;
}
