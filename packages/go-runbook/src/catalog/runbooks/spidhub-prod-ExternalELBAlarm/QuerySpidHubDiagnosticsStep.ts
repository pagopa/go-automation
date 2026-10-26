import { sumCloudWatchLogsQueryStatistics } from '@go-automation/go-common/aws';
import type { ResultField } from '@go-automation/go-common/aws';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import type { StepResult } from '../../../types/StepResult.js';
import { executeCloudWatchLogsQuery } from '../../../steps/data/executeCloudWatchLogsQuery.js';
import { executeStep } from '../../../steps/data/executeStep.js';
import { resolveTimeRange } from '../../../steps/data/resolveTimeRange.js';
import {
  ERROR_QUERY,
  ROW_LIMIT,
  SPIDHUB_ACCOUNT_ID,
  SPIDHUB_ALARM,
  SPIDHUB_LOG_GROUP,
  SPIDHUB_REGION,
  STREAM_QUERY,
} from './alarmDefinition.js';

type Rows = ReadonlyArray<ReadonlyArray<ResultField>>;
const RESPONDER_SIGNATURE =
  'Spid Authentication|Authentication Error|ERROR=Error: Value attribute of StatusCode is invalid: ' +
  'urn:oasis:names:tc:SAML:2.0:status:Responder';

/** Collects application evidence; ALB request correlation remains a manual account-level check. */
export class QuerySpidHubDiagnosticsStep implements Step<Rows> {
  readonly id = 'query-spidhub-diagnostics';
  readonly label = 'Errori e stream applicativi SPID Hub';
  readonly kind = 'data' as const;

  getTraceInfo(): Readonly<Record<string, unknown>> {
    return {
      accountId: SPIDHUB_ACCOUNT_ID,
      region: SPIDHUB_REGION,
      logGroup: SPIDHUB_LOG_GROUP,
      errorQuery: ERROR_QUERY,
      streamQuery: STREAM_QUERY,
      albCorrelation: 'MANUAL',
    };
  }

  async execute(context: RunbookContext): Promise<StepResult<Rows>> {
    return executeStep('SPID Hub diagnostics', async () => {
      for (const [param, expected] of [
        ['alarmName', SPIDHUB_ALARM],
        ['awsAccountId', SPIDHUB_ACCOUNT_ID],
        ['awsRegion', SPIDHUB_REGION],
      ] as const) {
        const actual = context.params.get(param);
        if (actual !== undefined && actual !== expected) {
          throw new Error(`Unsupported SPID Hub production ${param}: ${actual}`);
        }
      }
      const cloudWatchLogs = context.services.cloudWatchLogs.forTarget({
        accountId: SPIDHUB_ACCOUNT_ID,
        region: SPIDHUB_REGION,
      });
      const scopedContext = { ...context, services: { ...context.services, cloudWatchLogs } };
      const timeRange = resolveTimeRange(context, { start: 'startTime', end: 'endTime' });
      const queries: Awaited<ReturnType<typeof executeCloudWatchLogsQuery>>[] = [];
      const rows: ResultField[][] = [];
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
            { field: 'sourceAccountId', value: SPIDHUB_ACCOUNT_ID },
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
