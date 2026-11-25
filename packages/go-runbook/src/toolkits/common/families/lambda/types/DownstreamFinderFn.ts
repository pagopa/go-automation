import type { DownstreamMatch } from './DownstreamMatch.js';
import type { CloudWatchLogsRows } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';

/** Finds the first row of a Lambda log whose message routes to a downstream (bound to compiled patterns). */
export type DownstreamFinderFn = (rows: CloudWatchLogsRows) => DownstreamMatch | undefined;
