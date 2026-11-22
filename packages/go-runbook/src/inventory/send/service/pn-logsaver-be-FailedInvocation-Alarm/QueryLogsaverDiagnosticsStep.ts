import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { StepCoverage, StepResult } from '../../../../engine/index.js';
import {
  type AccountLogDiagnostics,
  type AccountLogRead,
  type ExecutedCloudWatchLogsQuery,
  type AccountScopedContext,
  mergeCloudWatchLogsDiagnostics,
  QueryAccountLogDiagnosticsStep,
  SEND_ACCOUNTS,
  type AwsAccountSelection,
  type OperationalContext,
  type CloudWatchLogsRows,
} from '../../../../toolkits/send/index.js';

export const LOG_GROUP = '/aws/ecs/pn-logsaver-be';
const ROW_LIMIT = 1000;
const SPOT_INTERRUPTION_MESSAGE = 'Your Spot Task was interrupted.';
/**
 * Both SEND production accounts locally; only the occurrence account with an occurrence.
 * Production only, as before the logical accounts.
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

const DIAGNOSTICS: AccountLogDiagnostics = {
  narrative: 'Logsaver diagnostics',
  accounts: ACCOUNTS,
  logGroup: LOG_GROUP,
  queries: [
    { kind: 'errors', query: ERROR_QUERY },
    { kind: 'streams', query: STREAM_QUERY },
  ],
};

/** Collect the logs and streams available for the logsaver occurrence. */
export class QueryLogsaverDiagnosticsStep extends QueryAccountLogDiagnosticsStep {
  readonly id = 'query-logsaver-diagnostics';
  readonly label = 'Log e stream del job logsaver';

  getTraceInfo(): Readonly<Record<string, unknown>> {
    return { logGroup: LOG_GROUP, errorQuery: ERROR_QUERY, streamQuery: STREAM_QUERY };
  }

  protected override diagnostics(): AccountLogDiagnostics {
    return DIAGNOSTICS;
  }

  protected override readSource(account: AccountScopedContext): string {
    return account.name;
  }

  protected override summarize(
    context: OperationalContext,
    reads: ReadonlyArray<AccountLogRead>,
  ): StepResult<CloudWatchLogsRows> {
    const rows: GOLogsInsightsResultField[][] = [];
    const answered: ExecutedCloudWatchLogsQuery[] = [];
    let errorCount = 0;
    let streamCount = 0;
    let spotInterruptionCount = 0;
    let unaccountedErrorCount = 0;
    // The counters sum the error reads of every account: they are complete only when every one of them is.
    let errorsComplete = true;
    const coverage: StepCoverage[] = [];
    for (const { account, queryKind, read: result } of reads) {
      if (result.failure !== undefined) {
        coverage.push(...result.coverage);
        if (queryKind === 'errors') errorsComplete = false;
        continue;
      }
      coverage.push(...result.coverage.map((entry) => ({ ...entry, source: account.name })));
      const truncated =
        result.rows.length >= ROW_LIMIT ||
        (queryKind === 'errors' &&
          (result.diagnostics?.cloudWatchLogs?.statistics.recordsMatched ?? 0) > result.rows.length);
      if (truncated && result.coverage.length === 0) {
        coverage.push({
          source: account.name,
          complete: false,
          reason: 'saturated',
          detail: `Logsaver ${queryKind} returned incomplete results`,
        });
      }
      if (queryKind === 'errors' && (truncated || result.coverage.length > 0)) errorsComplete = false;
      answered.push(result);
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
          { field: 'sourceAccount', value: account.name },
          { field: 'sourceAccountId', value: account.account.accountId },
          { field: 'queryKind', value: queryKind },
        ]),
      );
    }
    const diagnostics = mergeCloudWatchLogsDiagnostics(answered.map((result) => result.diagnostics));
    context.services.reporter.add({
      label: `Logsaver: ${String(errorCount)} log di errore, ${String(streamCount)} stream.`,
    });
    return {
      success: true,
      output: rows,
      vars: {
        logsaverDiagnostics: 'COLLECTED',
        logsaverAccountsChecked: [...new Set(reads.map(({ account }) => account.name))].join(','),
        logsaverErrorLogCount: String(errorCount),
        logsaverStreamCount: String(streamCount),
        logsaverSpotInterruptionLogCount: String(spotInterruptionCount),
        logsaverUnaccountedErrorLogCount: String(unaccountedErrorCount),
        logsaverUnaccountedErrorLogCountState: errorsComplete ? 'complete' : 'incomplete',
      },
      ...(coverage.length > 0 ? { coverage } : {}),
      ...(diagnostics === undefined ? {} : { diagnostics }),
    };
  }
}
