import type { CloudWatchLogsRow } from './CloudWatchLogsRow.js';

/** The identity of a row of a query, to keep a log event once across reads. */
export type LogRowIdentityFn = (row: CloudWatchLogsRow) => string;
