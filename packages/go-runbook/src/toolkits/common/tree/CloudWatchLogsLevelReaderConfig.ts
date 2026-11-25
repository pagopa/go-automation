import type { TimeRangeFromParams } from '../time/TimeRangeFromParams.js';

/** What every grouped read of CloudWatch Logs declares: its identity and the parameters of its time range. */
export interface CloudWatchLogsLevelReaderConfig {
  readonly id: string;
  readonly label: string;
  readonly timeRangeFromParams: TimeRangeFromParams;
}
