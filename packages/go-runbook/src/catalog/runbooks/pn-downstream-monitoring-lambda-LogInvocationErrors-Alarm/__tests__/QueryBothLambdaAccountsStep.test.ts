import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ResultField } from '@go-automation/go-common/aws';

import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { ConditionEvaluator } from '../../framework.js';
import type { RunbookContext } from '../../framework.js';
import { KNOWN_CASES } from '../knownCases.js';
import { QueryBothLambdaAccountsStep } from '../QueryBothLambdaAccountsStep.js';

interface QueryCall {
  readonly accountId: string;
  readonly profile?: string;
  readonly groups: ReadonlyArray<string>;
  readonly query: string;
  readonly paginateResults?: boolean;
}

function context(
  params: ReadonlyArray<readonly [string, string]>,
  calls: QueryCall[],
  failingAccount?: string,
  rowsByAccount?: ReadonlyMap<string, ReadonlyArray<ReadonlyArray<ResultField>>>,
): RunbookContext {
  return {
    executionId: 'dual-account-test',
    startedAt: new Date('2026-09-08T14:00:00.000Z'),
    stepResults: new Map(),
    vars: new Map([['lambdaRequestId', 'b95bb742-cc30-4f07-80bc-45a38011e5c4']]),
    params: new Map([['startTime', '2026-09-08T13:55:00.000Z'], ['endTime', '2026-09-08T14:05:00.000Z'], ...params]),
    logs: [],
    services: createTestServiceRegistry({
      cloudWatchLogs: {
        forTarget(target: { accountId: string; region: string; profile?: string }) {
          return {
            // eslint-disable-next-line @typescript-eslint/require-await
            async queryWithStatistics(
              groups: ReadonlyArray<string>,
              query: string,
              _timeRange: { start: Date; end: Date },
              options: { paginateResults?: boolean },
            ) {
              calls.push({
                accountId: target.accountId,
                ...(target.profile === undefined ? {} : { profile: target.profile }),
                groups,
                query,
                ...(options.paginateResults === undefined ? {} : { paginateResults: options.paginateResults }),
              });
              if (target.accountId === failingAccount) throw new Error('AccessDenied');
              const defaultRows: ReadonlyArray<ReadonlyArray<ResultField>> = [
                [
                  { field: '@timestamp', value: '2026-09-08T14:00:00.000Z' },
                  { field: '@message', value: `${target.accountId} ERROR Invoke Error` },
                ],
              ];
              const rows = rowsByAccount?.get(target.accountId) ?? defaultRows;
              return {
                rows,
                statistics: { bytesScanned: 1, recordsScanned: 1, recordsMatched: 1 },
                queryExecutions: [
                  {
                    queryId: target.accountId,
                    profile: target.profile ?? 'monitoring',
                    logGroups: groups,
                    statistics: { bytesScanned: 1, recordsScanned: 1, recordsMatched: 1 },
                  },
                ],
              };
            },
          };
        },
      },
    }),
    recoveredErrors: [],
  };
}

describe('pn-downstream-monitoring-lambda dual account query', () => {
  it('reads core and confinfo with separate local profiles and retains each source', async () => {
    const calls: QueryCall[] = [];
    const input = context([['awsProfiles', 'sso_pn-core-prod_readonly,sso_pn-confinfo-prod']], calls);
    const result = await new QueryBothLambdaAccountsStep('errors').execute(input);
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(
      calls.map(({ accountId, profile }) => ({ accountId, profile })),
      [
        { accountId: '510769970275', profile: 'sso_pn-core-prod_readonly' },
        { accountId: '350578575906', profile: 'sso_pn-confinfo-prod' },
      ],
    );
    assert.ok(
      calls.every(
        ({ groups, query, paginateResults }) =>
          groups[0] === '/aws/lambda/pn-downstream-monitoring-lambda' &&
          query.includes("@message like 'ERROR'") &&
          paginateResults === true,
      ),
    );
    assert.deepStrictEqual(
      result.output?.map((row) => row.find((field) => field.field === 'sourceAccount')?.value),
      ['core', 'confinfo'],
    );
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.queryExecutions.length, 2);
  });

  it('uses OAM targets in cloud execution and fails if either account cannot be read', async () => {
    const calls: QueryCall[] = [];
    const input = context(
      [
        ['awsAccountId', '510769970275'],
        ['awsProfiles', ''],
      ],
      calls,
      '350578575906',
    );
    const result = await new QueryBothLambdaAccountsStep('errors').execute(input);
    assert.strictEqual(result.success, false);
    assert.strictEqual(calls.length, 2);
    assert.ok(calls.every(({ profile }) => profile === undefined));
  });

  it('recognizes SlowDown when only confinfo has an error row', async () => {
    const calls: QueryCall[] = [];
    const rowsByAccount = new Map<string, ReadonlyArray<ReadonlyArray<ResultField>>>([
      ['510769970275', []],
      [
        '350578575906',
        [
          [
            {
              field: '@message',
              value:
                'ERROR Invoke Error {"errorType":"SlowDown","errorMessage":"Please reduce your request rate.","$metadata":{"httpStatusCode":503}}',
            },
          ],
        ],
      ],
    ]);
    const input = context(
      [
        ['awsAccountId', '510769970275'],
        ['awsProfiles', ''],
      ],
      calls,
      undefined,
      rowsByAccount,
    );
    const result = await new QueryBothLambdaAccountsStep('errors').execute(input);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output?.length, 1);
    const knownCase = KNOWN_CASES.find(({ id }) => id === 'downstream-monitoring-aws-slow-down');
    assert.ok(knownCase !== undefined);
    const evaluated = new ConditionEvaluator().evaluate(knownCase.condition, {
      ...input,
      stepResults: new Map([['query-lambda-errors', result.output]]),
    });
    assert.strictEqual(evaluated, true);
  });

  it('rejects an occurrence in a different environment before querying production', async () => {
    const calls: QueryCall[] = [];
    const input = context(
      [
        ['awsAccountId', '151559006927'],
        ['awsProfiles', ''],
      ],
      calls,
    );
    const result = await new QueryBothLambdaAccountsStep('errors').execute(input);
    assert.strictEqual(result.success, false);
    assert.deepStrictEqual(calls, []);
  });
});
