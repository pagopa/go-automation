import type { CloudWatchLogsRow } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRow.js';

/** Reads the trace id of an access-log row (bound to an access-log schema). */
export type TraceIdReaderFn = (row: CloudWatchLogsRow) => string | undefined;
