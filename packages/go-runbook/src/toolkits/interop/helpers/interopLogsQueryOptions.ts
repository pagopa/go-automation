import type { AWSCloudWatchLogsQueryOptions } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { RunbookContext } from '../../../engine/types/RunbookContext.js';

/**
 * Options of an INTEROP CloudWatch Logs query: the execution's abort signal, and
 * the log group searched among the configured profiles, because the INTEROP log
 * groups are named per environment (EVO-RBREORG-OPUS-01 P30).
 *
 * @param context - Runbook context
 * @returns The query options
 */
export function interopLogsQueryOptions(context: RunbookContext): AWSCloudWatchLogsQueryOptions {
  return {
    ...(context.signal === undefined ? {} : { signal: context.signal }),
    logGroupResolutionMode: 'search-configured-profiles',
  };
}
