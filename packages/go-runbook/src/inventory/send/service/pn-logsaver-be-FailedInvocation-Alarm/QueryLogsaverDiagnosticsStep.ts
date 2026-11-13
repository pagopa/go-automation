import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import { executeStep, type Step, type StepResult } from '../../../../engine/index.js';
import {
  awsLogicalAccountName,
  executeCloudWatchLogsQuery,
  mergeCloudWatchLogsDiagnostics,
  resolveAwsAccountSelection,
  resolveTimeRange,
  OperationalStep,
  SEND_ACCOUNTS,
  type AwsAccountSelection,
  type OperationalContext,
  type OperationalServiceName,
} from '../../../../toolkits/send/index.js';

export const LOG_GROUP = '/aws/ecs/pn-logsaver-be';
const ROW_LIMIT = 1000;
const SPOT_INTERRUPTION_MESSAGE = 'Your Spot Task was interrupted.';
/**
 * Both SEND production accounts locally; only the occurrence account with an occurrence.
 * Production only, as before the logical accounts (EVO-AWSACCT-OPUS-01 A4).
 */
const ACCOUNTS: AwsAccountSelection = {
  subject: 'logsaver',
  accounts: [SEND_ACCOUNTS.core, SEND_ACCOUNTS.confinfo],
  scope: 'occurrence-account',
  environments: ['prod'],
};

// Word boundaries avoid treating JAVA_TOOL_OPTIONS -XX:+ExitOnOutOfMemoryError
// as an application failure. Preserve raw messages and streams; never dedup.
export const ERROR_QUERY: string = `fields @timestamp, @logStream, trace_id, message, @message
| filter level = 'ERROR' or level = 'FATAL'
    or @message like /(?i)\\b(error|fatal|outofmemoryerror)\\b/
    or @message like /Exception:/
    or @message like /(?i)\\btimed?\\s*out\\b/
    or @message like /Your Spot Task was interrupted[.]/
| sort @timestamp asc
| limit ${ROW_LIMIT}`;

const STREAM_QUERY: string = `stats min(@timestamp) as firstLog, max(@timestamp) as lastLog,
    count(*) as logCount by @logStream
| sort lastLog desc
| limit ${ROW_LIMIT}`;

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;

/** Collect the logs and streams available for the logsaver occurrence. */
export class QueryLogsaverDiagnosticsStep extends OperationalStep<Rows> implements Step<Rows> {
  readonly id = 'query-logsaver-diagnostics';
  readonly label = 'Log e stream del job logsaver';
  readonly kind = 'data' as const;

  getTraceInfo(): Readonly<Record<string, unknown>> {
    return { logGroup: LOG_GROUP, errorQuery: ERROR_QUERY, streamQuery: STREAM_QUERY };
  }

  /**
   * Operational services this step uses.
   *
   * @returns The required service names
   */
  override requiredServices(): ReadonlyArray<OperationalServiceName> {
    return ['cloudWatchLogs', 'awsAccounts'];
  }

  /**
   * The SEND core and confinfo accounts of production.
   *
   * @returns The account selection of the step
   */
  override accountSelections(): ReadonlyArray<AwsAccountSelection> {
    return [ACCOUNTS];
  }

  override async execute(context: OperationalContext): Promise<StepResult<Rows>> {
    return executeStep('Logsaver diagnostics', async () => {
      const port = context.services.awsAccounts;
      if (port === undefined) throw new Error('Logsaver accounts not available');
      // Resolved in the execution environment; the pre-execution check prepared their readers.
      const targets = resolveAwsAccountSelection(context, ACCOUNTS).map((resolved) => ({
        name: awsLogicalAccountName(resolved.account),
        accountId: resolved.accountId,
        cloudWatchLogs: port.cloudWatchLogsFor(resolved.account),
      }));
      const timeRange = resolveTimeRange(context, { start: 'startTime', end: 'endTime' });
      const results: Awaited<ReturnType<typeof executeCloudWatchLogsQuery>>[] = [];
      const rows: GOLogsInsightsResultField[][] = [];
      let errorCount = 0;
      let streamCount = 0;
      let spotInterruptionCount = 0;
      let unaccountedErrorCount = 0;
      for (const source of targets) {
        const scopedContext = { ...context, services: { ...context.services, cloudWatchLogs: source.cloudWatchLogs } };
        for (const [queryKind, query] of [
          ['errors', ERROR_QUERY],
          ['streams', STREAM_QUERY],
        ] as const) {
          const result = await executeCloudWatchLogsQuery(scopedContext, [LOG_GROUP], query, timeRange, {
            ...(context.signal === undefined ? {} : { signal: context.signal }),
            paginateResults: true,
          });
          if (result.rows.length >= ROW_LIMIT) {
            throw new Error(
              `Logsaver ${queryKind} in ${source.name} reached ${String(ROW_LIMIT)} rows; narrow the time range`,
            );
          }
          if (
            queryKind === 'errors' &&
            (result.diagnostics?.cloudWatchLogs?.statistics.recordsMatched ?? 0) > result.rows.length
          ) {
            throw new Error(`Logsaver errors in ${source.name} returned incomplete results; narrow the time range`);
          }
          results.push(result);
          if (queryKind === 'errors') {
            errorCount += result.rows.length;
            for (const row of result.rows) {
              const messages = row
                .filter(({ field }) => field === '@message' || field === 'message')
                .map(({ value }) => value?.trim())
                .filter((value): value is string => value !== undefined && value !== '' && value !== '-');
              if (messages.some((message) => message.includes(SPOT_INTERRUPTION_MESSAGE))) spotInterruptionCount += 1;
              // A substring hit cannot account for another failure in the same row.
              // Unknown layouts, compound messages and missing messages need follow-up.
              if (messages.length === 0 || !messages.every((message) => message === SPOT_INTERRUPTION_MESSAGE)) {
                unaccountedErrorCount += 1;
              }
            }
          } else streamCount += result.rows.length;
          rows.push(
            ...result.rows.map((row) => [
              ...row,
              { field: 'sourceAccount', value: source.name },
              { field: 'sourceAccountId', value: source.accountId },
              { field: 'queryKind', value: queryKind },
            ]),
          );
        }
      }
      const diagnostics = mergeCloudWatchLogsDiagnostics(results.map((result) => result.diagnostics));
      context.services.reporter.add({
        label: `Logsaver: ${String(errorCount)} log di errore, ${String(streamCount)} stream.`,
      });
      return {
        success: true,
        output: rows,
        vars: {
          logsaverDiagnostics: 'COLLECTED',
          logsaverAccountsChecked: targets.map((target) => target.name).join(','),
          logsaverErrorLogCount: String(errorCount),
          logsaverStreamCount: String(streamCount),
          logsaverSpotInterruptionLogCount: String(spotInterruptionCount),
          logsaverUnaccountedErrorLogCount: String(unaccountedErrorCount),
        },
        ...(diagnostics === undefined ? {} : { diagnostics }),
      };
    });
  }
}
