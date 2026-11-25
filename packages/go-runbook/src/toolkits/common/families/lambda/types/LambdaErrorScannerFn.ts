import type { LambdaErrorScan } from '../helpers/scanLambdaLogs.js';
import type { CloudWatchLogsRows } from '../../../steps/aws/cloudwatch-logs/CloudWatchLogsRows.js';

/** Scans the rows of a Lambda error query (bound to the profile's downstream signatures). */
export type LambdaErrorScannerFn = (rows: CloudWatchLogsRows) => LambdaErrorScan | undefined;
