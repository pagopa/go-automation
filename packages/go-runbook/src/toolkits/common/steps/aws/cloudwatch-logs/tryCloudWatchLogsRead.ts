import { toError } from '@pagopa/go-common/errors';

import type { OperationalContext } from '../../../services/OperationalContext.js';
import type { CloudWatchLogsRead } from './CloudWatchLogsRead.js';
import type { CloudWatchLogsReadAttempt } from './CloudWatchLogsReadAttempt.js';
import { endsCloudWatchLogsRead } from './endsCloudWatchLogsRead.js';
import { executeCloudWatchLogsQuery } from './executeCloudWatchLogsQuery.js';

/**
 * Runs a Logs Insights read that may fail without failing the step: the rows of the read, or, when it fails, no rows
 * and an `unavailable` coverage entry with the error.
 *
 * - A cancellation of the execution and a configuration error of the target are always thrown.
 * - The gaps of the read, and the entry of a failure, name the `identifiers` of the read when it has some.
 * - The failed entry is labelled with `source`, or with the log groups of the read.
 *
 * @param context - Context of the step
 * @param read - Log groups, query, time range and options of the read, with its identifiers
 * @returns The read, with `failure` when it failed
 * @throws Error on cancellation and on a configuration error of the target
 *
 * @example
 * ```typescript
 * const read = await tryCloudWatchLogsRead(context, { logGroups: [logGroup], query, timeRange, options: {} });
 * if (read.failure !== undefined) return unavailable(read.coverage);
 * ```
 */
export async function tryCloudWatchLogsRead(
  context: OperationalContext,
  read: CloudWatchLogsRead,
): Promise<CloudWatchLogsReadAttempt> {
  const identifiers = read.identifiers !== undefined && read.identifiers.length > 0 ? read.identifiers : undefined;
  try {
    const result = await executeCloudWatchLogsQuery(context, read.logGroups, read.query, read.timeRange, read.options);
    if (identifiers === undefined) return result;
    return { ...result, coverage: result.coverage.map((entry) => ({ ...entry, identifiers })) };
  } catch (error: unknown) {
    if (endsCloudWatchLogsRead(context, error)) throw error;
    const failure = toError(error);
    return {
      rows: [],
      failure,
      coverage: [
        {
          source: read.source ?? read.logGroups.join(', '),
          complete: false,
          reason: 'unavailable',
          detail: failure.message,
          ...(identifiers === undefined ? {} : { identifiers }),
        },
      ],
    };
  }
}
