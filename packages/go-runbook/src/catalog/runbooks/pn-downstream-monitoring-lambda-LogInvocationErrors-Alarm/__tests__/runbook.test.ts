import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOLogger } from '@go-automation/go-common/core';
import type { ResultField } from '@go-automation/go-common/aws';

import { RunbookEngine } from '../../../../core/RunbookEngine.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { assertCloudExecutableRunbook } from '../../../../validation/assertCloudExecutableRunbook.js';
import { DOWNSTREAM_MONITORING_LAMBDA_ALARM } from '../registration.js';
import { buildRunbook } from '../runbook.js';

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
      lambda: {
        name: 'pn-downstream-monitoring-lambda',
        logGroup: '/aws/lambda/pn-downstream-monitoring-lambda',
        varPrefix: 'downstreamMonitoring',
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
    const invocationCalls: { accountId: string; query: string }[] = [];
    const row = (message: string, requestId: string): ReadonlyArray<ResultField> => [
      { field: '@timestamp', value: '2026-09-08T14:00:00.000Z' },
      { field: '@requestId', value: requestId },
      { field: '@message', value: message },
    ];
    const cloudWatchLogs = {
      forTarget({ accountId }: { accountId: string }) {
        return {
          // eslint-disable-next-line @typescript-eslint/require-await
          async queryWithStatistics(_groups: ReadonlyArray<string>, query: string) {
            const isErrorScan = query.includes("@message like 'ERROR'");
            if (!isErrorScan) invocationCalls.push({ accountId, query });
            const rows = isErrorScan
              ? accountId === '510769970275'
                ? [row('ERROR core invocation', coreRequestId)]
                : [row('ERROR confinfo invocation', confinfoRequestId)]
              : accountId === '350578575906' && query.includes(confinfoRequestId)
                ? [
                    row(
                      'Invoke Error {"errorType":"SlowDown","errorMessage":"Please reduce your request rate.","$metadata":{"httpStatusCode":503}}',
                      confinfoRequestId,
                    ),
                  ]
                : accountId === '510769970275' && query.includes(coreRequestId)
                  ? [row(`START RequestId: ${coreRequestId}`, coreRequestId)]
                  : [];
            return {
              rows,
              statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
              queryExecutions: [],
            };
          },
        };
      },
    };

    const result = await new RunbookEngine(new GOLogger()).execute(
      buildRunbook(),
      new Map([
        ['alarmName', DOWNSTREAM_MONITORING_LAMBDA_ALARM],
        ['awsProfiles', 'sso_pn-core-prod_readonly,sso_pn-confinfo-prod'],
        ['awsRegion', 'eu-south-1'],
        ['startTime', '2026-09-08T13:55:00.000Z'],
        ['endTime', '2026-09-08T14:05:00.000Z'],
      ]),
      createTestServiceRegistry({ cloudWatchLogs }),
    );

    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(
      invocationCalls.map(({ accountId, query }) => ({
        accountId,
        coreRequestId: query.includes(coreRequestId),
        confinfoRequestId: query.includes(confinfoRequestId),
      })),
      [
        { accountId: '510769970275', coreRequestId: true, confinfoRequestId: false },
        { accountId: '350578575906', coreRequestId: false, confinfoRequestId: true },
      ],
    );
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['downstream-monitoring-aws-slow-down'],
    );
    const invocationRows = result.finalContext.stepResults.get('query-lambda-invocation') as ReadonlyArray<
      ReadonlyArray<ResultField>
    >;
    assert.deepStrictEqual(
      invocationRows.map((logRow) => logRow.find((field) => field.field === 'sourceAccount')?.value),
      ['core', 'confinfo'],
    );
  });

  it('classifies a signal-killed runtime line when it is the only error in confinfo', async () => {
    const requestId = 'd848f0c5-1089-5c2b-9a3b-91a94511ee52';
    const invocationCalls: { accountId: string; query: string }[] = [];
    const cloudWatchLogs = {
      forTarget({ accountId }: { accountId: string }) {
        return {
          // eslint-disable-next-line @typescript-eslint/require-await
          async queryWithStatistics(_groups: ReadonlyArray<string>, query: string) {
            const isErrorScan = query.includes("@message like 'ERROR'");
            if (!isErrorScan) invocationCalls.push({ accountId, query });
            const rows: ReadonlyArray<ReadonlyArray<ResultField>> =
              isErrorScan &&
              accountId === '350578575906' &&
              query.includes('Runtime exited with error:\\s*signal:\\s*killed')
                ? [
                    [
                      { field: '@timestamp', value: '2026-09-08T14:00:00.000Z' },
                      { field: '@requestId', value: requestId },
                      { field: '@message', value: 'Runtime exited with error: signal: killed' },
                    ],
                  ]
                : [];
            return {
              rows,
              statistics: { bytesScanned: 1, recordsScanned: rows.length, recordsMatched: rows.length },
              queryExecutions: [],
            };
          },
        };
      },
    };

    const result = await new RunbookEngine(new GOLogger()).execute(
      buildRunbook(),
      new Map([
        ['alarmName', DOWNSTREAM_MONITORING_LAMBDA_ALARM],
        ['awsProfiles', 'sso_pn-core-prod_readonly,sso_pn-confinfo-prod'],
        ['startTime', '2026-09-08T13:55:00.000Z'],
        ['endTime', '2026-09-08T14:05:00.000Z'],
      ]),
      createTestServiceRegistry({ cloudWatchLogs }),
    );

    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.finalContext.vars.get('lambdaErrorCategory'), 'out-of-memory');
    assert.deepStrictEqual(
      result.matchedCases.map(({ id }) => id),
      ['lambda-out-of-memory'],
    );
    assert.deepStrictEqual(
      invocationCalls.map(({ accountId, query }) => ({ accountId, correlated: query.includes(requestId) })),
      [{ accountId: '350578575906', correlated: true }],
    );
  });

  it('stops before correlation when an account error scan reaches the row limit', async () => {
    const queries: string[] = [];
    const saturatedRows = Array.from({ length: 1000 }, () => [
      { field: '@requestId', value: 'b95bb742-cc30-4f07-80bc-45a38011e5c4' },
      { field: '@message', value: 'ERROR' },
    ]);
    const cloudWatchLogs = {
      forTarget() {
        return {
          // eslint-disable-next-line @typescript-eslint/require-await
          async queryWithStatistics(_groups: ReadonlyArray<string>, query: string) {
            queries.push(query);
            return {
              rows: saturatedRows,
              statistics: { bytesScanned: 1, recordsScanned: 1000, recordsMatched: 1000 },
              queryExecutions: [],
            };
          },
        };
      },
    };

    const result = await new RunbookEngine(new GOLogger()).execute(
      buildRunbook(),
      new Map([
        ['alarmName', DOWNSTREAM_MONITORING_LAMBDA_ALARM],
        ['awsProfiles', 'sso_pn-core-prod_readonly,sso_pn-confinfo-prod'],
        ['startTime', '2026-09-08T13:55:00.000Z'],
        ['endTime', '2026-09-08T14:05:00.000Z'],
      ]),
      createTestServiceRegistry({ cloudWatchLogs }),
    );

    assert.strictEqual(result.status, 'failed');
    assert.match(result.trace.execution.failureReason ?? '', /core.*1000-row limit/);
    assert.deepStrictEqual(
      result.trace.pipeline.map(({ stepId }) => stepId),
      ['prepare-lambda-section', 'query-lambda-errors'],
    );
    assert.strictEqual(queries.length, 1);
  });
});
