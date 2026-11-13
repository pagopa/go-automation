import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import { GOLogger } from '@pagopa/go-common/logging';

import type { RunbookExecutionResult } from '../../../../../engine/index.js';
import {
  assertCloudExecutableRunbook,
  awsLogicalAccountName,
  createTestServiceRegistry,
  SEND_ACCOUNTS,
} from '../../../../../toolkits/send/index.js';
import { rejectsWith } from '../../../../../toolkits/common/accounts/__tests__/fixtures.js';
import { OperationalRunbookEngine } from '../../../../../toolkits/common/engine/OperationalRunbookEngine.js';
import type { InMemoryAwsAccountsPortOptions } from '../../../../../toolkits/common/testing/InMemoryAwsAccountsPortOptions.js';
import {
  fakeReader,
  occurrenceIn,
  SEND_ACCOUNT_IDS,
  sendAccountsPort,
  SEND_TEST_ENVIRONMENT,
} from '../../../../../toolkits/send/accounts/__tests__/fixtures.js';
import { DOWNSTREAM_MONITORING_LAMBDA_ALARM } from '../registration.js';
import { buildRunbook } from '../runbook.js';

type Rows = ReadonlyArray<ReadonlyArray<GOLogsInsightsResultField>>;
/** Rows a logical account (`core`, `confinfo`) returns for a query. */
type ReadQueryFn = (account: string, query: string) => Rows;

/**
 * Runs the runbook through the operational engine, so the pre-execution account
 * check prepares the readers, with an occurrence in production SEND core by default.
 */
async function run(
  read: ReadQueryFn,
  portOptions: Partial<InMemoryAwsAccountsPortOptions> = occurrenceIn(SEND_ACCOUNT_IDS.coreProd),
): Promise<RunbookExecutionResult> {
  const readers = Object.fromEntries(
    [SEND_ACCOUNTS.core, SEND_ACCOUNTS.confinfo].map((account) => [
      account,
      fakeReader({
        // eslint-disable-next-line @typescript-eslint/require-await
        async queryWithStatistics(_groups: ReadonlyArray<string>, query: string) {
          const rows = read(awsLogicalAccountName(account), query);
          return {
            rows,
            statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
            queryExecutions: [],
          };
        },
      }),
    ]),
  );
  return new OperationalRunbookEngine(new GOLogger()).execute(
    buildRunbook(),
    new Map([
      ['alarmName', DOWNSTREAM_MONITORING_LAMBDA_ALARM],
      ['startTime', '2026-09-08T13:55:00.000Z'],
      ['endTime', '2026-09-08T14:05:00.000Z'],
    ]),
    createTestServiceRegistry({ awsAccounts: sendAccountsPort({ ...portOptions, readers }) }),
    SEND_TEST_ENVIRONMENT,
  );
}

describe('pn-downstream-monitoring-lambda runbook', () => {
  it('builds a read-only SEND Lambda runbook with its operational references', () => {
    const runbook = buildRunbook();

    assert.strictEqual(runbook.metadata.id, DOWNSTREAM_MONITORING_LAMBDA_ALARM);
    assert.deepStrictEqual(runbook.cloudExecutionPolicy, { sideEffects: 'NONE' });
    assert.deepStrictEqual(runbook.analysisDefaults?.resources, [
      { name: 'pn-downstream-monitoring-lambda', role: 'PRIMARY' },
    ]);
    assert.strictEqual(runbook.analysisDefaults?.runbookName, DOWNSTREAM_MONITORING_LAMBDA_ALARM);
    assert.deepStrictEqual(
      runbook.analysisDefaults?.links?.map(({ type }) => type),
      ['CONFLUENCE', 'SLACK'],
    );
    assert.deepStrictEqual(runbook.runbookContext, {
      kind: 'lambda',
      product: 'SEND',
      lambda: {
        name: 'pn-downstream-monitoring-lambda',
        logGroup: '/aws/lambda/pn-downstream-monitoring-lambda',
        varPrefix: 'downstreamMonitoring',
        eventSource: 'cloudwatch-logs',
        configuredTimeoutMs: 60_000,
      },
      downstreams: [],
      queryProfileId: 'send',
    });
    assert.doesNotThrow(() => assertCloudExecutableRunbook(runbook));
    assert.deepStrictEqual(
      runbook.steps.map(({ step }) => step.id),
      [
        'prepare-lambda-section',
        'query-lambda-errors',
        'parse-lambda-errors',
        'query-lambda-invocation',
        'analyze-lambda-invocation',
      ],
    );
  });

  it('analyzes invocation evidence from distinct request IDs in core and confinfo', async () => {
    const coreRequestId = 'b95bb742-cc30-4f07-80bc-45a38011e5c4';
    const confinfoRequestId = 'd848f0c5-1089-5c2b-9a3b-91a94511ee52';
    const invocationCalls: { account: string; query: string }[] = [];
    const row = (message: string, requestId: string): ReadonlyArray<GOLogsInsightsResultField> => [
      { field: '@timestamp', value: '2026-09-08T14:00:00.000Z' },
      { field: '@requestId', value: requestId },
      { field: '@message', value: message },
    ];

    const result = await run((account, query) => {
      const isErrorScan = query.includes("@message like 'ERROR'");
      if (!isErrorScan) invocationCalls.push({ account, query });
      if (isErrorScan) {
        return account === 'core'
          ? [row('ERROR core invocation', coreRequestId)]
          : [row('ERROR confinfo invocation', confinfoRequestId)];
      }
      if (account === 'confinfo' && query.includes(confinfoRequestId)) {
        return [
          row(
            'Invoke Error {"errorType":"SlowDown","errorMessage":"Please reduce your request rate.","$metadata":{"httpStatusCode":503}}',
            confinfoRequestId,
          ),
        ];
      }
      return account === 'core' && query.includes(coreRequestId)
        ? [row(`START RequestId: ${coreRequestId}`, coreRequestId)]
        : [];
    });

    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(
      invocationCalls.map(({ account, query }) => ({
        account,
        coreRequestId: query.includes(coreRequestId),
        confinfoRequestId: query.includes(confinfoRequestId),
      })),
      [
        { account: 'core', coreRequestId: true, confinfoRequestId: false },
        { account: 'confinfo', coreRequestId: false, confinfoRequestId: true },
      ],
    );
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['downstream-monitoring-aws-slow-down'],
    );
    const invocationRows = result.finalContext.stepResults.get('query-lambda-invocation') as Rows;
    assert.deepStrictEqual(
      invocationRows.map((logRow) => logRow.find((field) => field.field === 'sourceAccount')?.value),
      ['core', 'confinfo'],
    );
  });

  it('classifies a signal-killed runtime line when it is the only error in confinfo', async () => {
    const requestId = 'd848f0c5-1089-5c2b-9a3b-91a94511ee52';
    const invocationCalls: { account: string; query: string }[] = [];

    const result = await run(
      (account, query) => {
        const isErrorScan = query.includes("@message like 'ERROR'");
        if (!isErrorScan) invocationCalls.push({ account, query });
        return isErrorScan &&
          account === 'confinfo' &&
          query.includes('Runtime exited with error:\\s*signal:\\s*killed')
          ? [
              [
                { field: '@timestamp', value: '2026-09-08T14:00:00.000Z' },
                { field: '@requestId', value: requestId },
                { field: '@message', value: 'Runtime exited with error: signal: killed' },
              ],
            ]
          : [];
      },
      { environment: 'prod' },
    );

    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.finalContext.vars.get('lambdaErrorCategory'), 'out-of-memory');
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['lambda-out-of-memory'],
    );
    assert.deepStrictEqual(
      invocationCalls.map(({ account, query }) => ({ account, correlated: query.includes(requestId) })),
      [{ account: 'confinfo', correlated: true }],
    );
  });

  it('stops before correlation when an account error scan reaches the row limit', async () => {
    const queries: string[] = [];
    const saturatedRows = Array.from({ length: 1000 }, () => [
      { field: '@requestId', value: 'b95bb742-cc30-4f07-80bc-45a38011e5c4' },
      { field: '@message', value: 'ERROR' },
    ]);

    const result = await run((_account, query) => {
      queries.push(query);
      return saturatedRows;
    });

    assert.strictEqual(result.status, 'failed');
    assert.match(result.trace.execution.failureReason ?? '', /core.*1000-row limit/);
    assert.deepStrictEqual(
      result.trace.pipeline.map(({ stepId }) => stepId),
      ['prepare-lambda-section', 'query-lambda-errors'],
    );
    assert.strictEqual(queries.length, 1);
  });

  it('reads both uat accounts for a uat occurrence', async () => {
    const accounts: string[] = [];
    const result = await run((account, query) => {
      if (query.includes("@message like 'ERROR'")) accounts.push(account);
      return [];
    }, occurrenceIn(SEND_ACCOUNT_IDS.confinfoUat));

    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(accounts, ['core', 'confinfo']);
    assert.strictEqual(result.finalContext.vars.get('downstreamMonitoringAccountsChecked'), 'core,confinfo');
  });

  it('rejects, before any query, an occurrence outside the SEND accounts or an unreachable account', async () => {
    for (const [portOptions, code] of [
      [occurrenceIn(SEND_ACCOUNT_IDS.unrelated), 'AWS_OCCURRENCE_ACCOUNT_MISMATCH'],
      [{ environment: 'prod', unreachable: [SEND_ACCOUNTS.confinfo] }, 'AWS_ACCOUNT_UNREACHABLE'],
    ] as const) {
      const queries: string[] = [];
      await assert.rejects(
        async () =>
          run((_account, query) => {
            queries.push(query);
            return [];
          }, portOptions),
        rejectsWith(code),
      );
      assert.deepStrictEqual(queries, []);
    }
  });
});
