import type { CloudWatchLogsRows } from '../../../common/steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';

export interface InteropK8sCidTrackerResult {
  readonly cid: string;
  readonly rows: CloudWatchLogsRows;
}
