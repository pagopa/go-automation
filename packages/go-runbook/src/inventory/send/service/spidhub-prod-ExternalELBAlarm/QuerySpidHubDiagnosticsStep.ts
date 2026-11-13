import {
  type GOLogsInsightsResultField,
  sumCloudWatchLogsQueryStatistics,
} from '@pagopa/go-aws/cloudwatch-logs/insights';

import { executeStep, type Step, type StepResult } from '../../../../engine/index.js';
import {
  executeCloudWatchLogsQuery,
  resolveAwsAccountSelection,
  resolveTimeRange,
  OperationalStep,
  type AwsAccountSelection,
  type OperationalContext,
  type OperationalServiceName,
} from '../../../../toolkits/send/index.js';
import {
  ERROR_QUERY,
  ROW_LIMIT,
  SPIDHUB_ACCOUNTS,
  SPIDHUB_ALARM,
  SPIDHUB_LOG_GROUP,
  STREAM_QUERY,
} from './alarmDefinition.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;
const RESPONDER_SIGNATURE =
  'Spid Authentication|Authentication Error|ERROR=Error: Value attribute of StatusCode is invalid: ' +
  'urn:oasis:names:tc:SAML:2.0:status:Responder';

/** Collects application evidence; ALB request correlation remains a manual account-level check. */
export class QuerySpidHubDiagnosticsStep extends OperationalStep<Rows> implements Step<Rows> {
  readonly id = 'query-spidhub-diagnostics';
  readonly label = 'Errori e stream applicativi SPID Hub';
  readonly kind = 'data' as const;

  getTraceInfo(): Readonly<Record<string, unknown>> {
    return {
      accounts: SPIDHUB_ACCOUNTS.accounts,
      logGroup: SPIDHUB_LOG_GROUP,
      errorQuery: ERROR_QUERY,
      streamQuery: STREAM_QUERY,
      albCorrelation: 'MANUAL',
    };
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
   * The SEND confinfo account of production.
   *
   * @returns The account selection of the step
   */
  override accountSelections(): ReadonlyArray<AwsAccountSelection> {
    return [SPIDHUB_ACCOUNTS];
  }

  override async execute(context: OperationalContext): Promise<StepResult<Rows>> {
    return executeStep('SPID Hub diagnostics', async () => {
      const alarmName = context.params.get('alarmName');
      if (alarmName !== undefined && alarmName !== SPIDHUB_ALARM) {
        throw new Error(`Unsupported SPID Hub production alarmName: ${alarmName}`);
      }
      // Account and region come from the account directory; the pre-execution check
      // already rejected an occurrence outside production SEND confinfo.
      const [account] = resolveAwsAccountSelection(context, SPIDHUB_ACCOUNTS);
      const port = context.services.awsAccounts;
      if (account === undefined || port === undefined) throw new Error('SPID Hub account not resolved');
      const cloudWatchLogs = port.cloudWatchLogsFor(account.account);
      const scopedContext = { ...context, services: { ...context.services, cloudWatchLogs } };
      const timeRange = resolveTimeRange(context, { start: 'startTime', end: 'endTime' });
      const queries: Awaited<ReturnType<typeof executeCloudWatchLogsQuery>>[] = [];
      const rows: GOLogsInsightsResultField[][] = [];
      let errorCount = 0;
      let streamCount = 0;
      let responderCount = 0;
      let headersSentCount = 0;
      for (const [queryKind, query] of [
        ['errors', ERROR_QUERY],
        ['streams', STREAM_QUERY],
      ] as const) {
        const result = await executeCloudWatchLogsQuery(scopedContext, [SPIDHUB_LOG_GROUP], query, timeRange, {
          ...(context.signal === undefined ? {} : { signal: context.signal }),
          paginateResults: true,
        });
        if (result.rows.length >= ROW_LIMIT) {
          throw new Error(`SPID Hub ${queryKind} reached ${String(ROW_LIMIT)} rows; narrow the time range`);
        }
        queries.push(result);
        if (queryKind === 'errors') {
          errorCount = result.rows.length;
          for (const row of result.rows) {
            const message = row.find((cell) => cell.field === '@message')?.value ?? '';
            if (message.includes('[io-spid-commons]') && message.includes(RESPONDER_SIGNATURE)) responderCount += 1;
            if (/\bERR_HTTP_HEADERS_SENT\b/u.test(message)) headersSentCount += 1;
          }
        } else streamCount = result.rows.length;
        rows.push(
          ...result.rows.map((row) => [
            ...row,
            { field: 'sourceAccountId', value: account.accountId },
            { field: 'queryKind', value: queryKind },
          ]),
        );
      }
      const diagnostics = queries.flatMap((query) => query.diagnostics?.cloudWatchLogs ?? []);
      return {
        success: true,
        output: rows,
        vars: {
          spidHubDiagnostics: 'COLLECTED',
          spidHubAccountId: account.accountId,
          spidHubErrorLogCount: String(errorCount),
          spidHubStreamCount: String(streamCount),
          spidHubResponderCount: String(responderCount),
          spidHubHeadersSentCount: String(headersSentCount),
        },
        ...(diagnostics.length !== queries.length
          ? {}
          : {
              diagnostics: {
                cloudWatchLogs: {
                  rowsReturned: rows.length,
                  statistics: sumCloudWatchLogsQueryStatistics(diagnostics.map((value) => value.statistics)),
                  queryExecutions: diagnostics.flatMap((value) => value.queryExecutions),
                },
              },
            }),
      };
    });
  }
}
