import type { AWSCloudWatchLogsQueryOptions } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { EvidenceIdentifier } from '../../../../../engine/index.js';
import type { TimeRange } from '../../../time/TimeRange.js';

/** A Logs Insights read of a step: what is read, and how its gaps are named. */
export interface CloudWatchLogsRead {
  readonly logGroups: ReadonlyArray<string>;
  readonly query: string;
  readonly timeRange: TimeRange;
  readonly options: Omit<AWSCloudWatchLogsQueryOptions, 'signal'>;
  readonly identifiers?: ReadonlyArray<EvidenceIdentifier>;
  readonly source?: string;
}
