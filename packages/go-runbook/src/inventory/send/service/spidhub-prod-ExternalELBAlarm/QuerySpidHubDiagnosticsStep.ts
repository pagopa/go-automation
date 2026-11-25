import { type GOLogsInsightsResultField, readRowField } from '@pagopa/go-aws/cloudwatch-logs/insights';

import type { StepCoverage, StepResult } from '../../../../engine/index.js';
import {
  type AccountLogDiagnostics,
  type AccountLogRead,
  type ExecutedCloudWatchLogsQuery,
  type AccountScopedContext,
  mergeCloudWatchLogsDiagnostics,
  QueryAccountLogDiagnosticsStep,
  type OperationalContext,
  type CloudWatchLogsRows,
} from '../../../../toolkits/send/index.js';
import { ERROR_QUERY, SPIDHUB_ACCOUNTS, SPIDHUB_ALARM, SPIDHUB_LOG_GROUP, STREAM_QUERY } from './alarmDefinition.js';

const RESPONDER_SIGNATURE =
  'Spid Authentication|Authentication Error|ERROR=Error: Value attribute of StatusCode is invalid: ' +
  'urn:oasis:names:tc:SAML:2.0:status:Responder';

const DIAGNOSTICS: AccountLogDiagnostics = {
  narrative: 'SPID Hub diagnostics',
  accounts: SPIDHUB_ACCOUNTS,
  logGroup: SPIDHUB_LOG_GROUP,
  queries: [
    { kind: 'errors', query: ERROR_QUERY },
    { kind: 'streams', query: STREAM_QUERY },
  ],
};

/** Collects application evidence; ALB request correlation remains a manual account-level check. */
export class QuerySpidHubDiagnosticsStep extends QueryAccountLogDiagnosticsStep {
  readonly id = 'query-spidhub-diagnostics';
  readonly label = 'Errori e stream applicativi SPID Hub';

  getTraceInfo(): Readonly<Record<string, unknown>> {
    return {
      accounts: SPIDHUB_ACCOUNTS.accounts,
      logGroup: SPIDHUB_LOG_GROUP,
      errorQuery: ERROR_QUERY,
      streamQuery: STREAM_QUERY,
      albCorrelation: 'MANUAL',
    };
  }

  protected override diagnostics(): AccountLogDiagnostics {
    return DIAGNOSTICS;
  }

  /**
   * Rejects the alarms of other environments: account and region come from the account directory, and the
   * pre-execution check already rejected an occurrence outside production SEND confinfo.
   *
   * @param context - Operational context
   * @throws Error when the alarm is not the production SPID Hub alarm
   */
  protected override checkOccurrence(context: OperationalContext): void {
    const alarmName = context.params.get('alarmName');
    if (alarmName !== undefined && alarmName !== SPIDHUB_ALARM) {
      throw new Error(`Unsupported SPID Hub production alarmName: ${alarmName}`);
    }
  }

  protected override readSource(_account: AccountScopedContext, queryKind: string): string {
    return `${SPIDHUB_LOG_GROUP} ${queryKind}`;
  }

  protected override summarize(
    _context: OperationalContext,
    reads: ReadonlyArray<AccountLogRead>,
  ): StepResult<CloudWatchLogsRows> {
    const rows: GOLogsInsightsResultField[][] = [];
    const answered: ExecutedCloudWatchLogsQuery[] = [];
    let errorCount = 0;
    let streamCount = 0;
    let responderCount = 0;
    let headersSentCount = 0;
    // The ALB requests are correlated by hand: the diagnosis never sees them.
    const coverage: StepCoverage[] = [
      { source: 'ALB', complete: false, reason: 'manual', detail: 'correlazione delle richieste ALB manuale' },
    ];
    for (const { account, queryKind, read } of reads) {
      // Each read stands on its own: a failed one is unavailable, the other keeps its rows; a read at the row limit
      // is declared saturated by the read itself.
      coverage.push(...read.coverage);
      if (read.failure !== undefined) continue;
      answered.push(read);
      if (queryKind === 'errors') {
        errorCount = read.rows.length;
        for (const row of read.rows) {
          const message = readRowField(row, '@message') ?? '';
          if (message.includes('[io-spid-commons]') && message.includes(RESPONDER_SIGNATURE)) responderCount += 1;
          if (/\bERR_HTTP_HEADERS_SENT\b/u.test(message)) headersSentCount += 1;
        }
      } else streamCount = read.rows.length;
      rows.push(
        ...read.rows.map((row) => [
          ...row,
          { field: 'sourceAccountId', value: account.account.accountId },
          { field: 'queryKind', value: queryKind },
        ]),
      );
    }
    const diagnostics = mergeCloudWatchLogsDiagnostics(answered.map((read) => read.diagnostics));
    return {
      success: true,
      output: rows,
      coverage,
      vars: {
        spidHubDiagnostics: 'COLLECTED',
        spidHubAccountId: reads[0]?.account.account.accountId ?? '',
        spidHubErrorLogCount: String(errorCount),
        spidHubStreamCount: String(streamCount),
        spidHubResponderCount: String(responderCount),
        spidHubHeadersSentCount: String(headersSentCount),
      },
      ...(diagnostics === undefined ? {} : { diagnostics }),
    };
  }
}
