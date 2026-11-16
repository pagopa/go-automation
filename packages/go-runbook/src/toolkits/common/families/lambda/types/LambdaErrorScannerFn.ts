import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { LambdaErrorScan } from '../helpers/scanLambdaLogs.js';

/** Scans the rows of a Lambda error query (bound to the profile's downstream signatures). */
export type LambdaErrorScannerFn = (
  rows: ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>,
) => LambdaErrorScan | undefined;
