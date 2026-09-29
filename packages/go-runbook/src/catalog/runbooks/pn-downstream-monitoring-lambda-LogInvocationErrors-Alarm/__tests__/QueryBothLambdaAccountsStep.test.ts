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

const CORE_REQUEST_ID = 'b95bb742-cc30-4f07-80bc-45a38011e5c4';
const SECOND_CORE_REQUEST_ID = '1a1bf5ea-2088-4ea7-9133-12fcbfaabacc';
const CONFINFO_REQUEST_ID = 'd848f0c5-1089-5c2b-9a3b-91a94511ee52';

function context(
  params: ReadonlyArray<readonly [string, string]>,
  calls: QueryCall[],
  failingAccount?: string,
  rowsByAccount?: ReadonlyMap<string, ReadonlyArray<ReadonlyArray<ResultField>>>,
): RunbookContext {
  return {
    executionId: 'dual-account-test',
    startedAt: new Date('2026-09-08T14:00:00.000Z'),
    stepResults: new Map([
      [
        'query-lambda-errors',
        [
          [
            { field: 'sourceAccount', value: 'core' },
            { field: '@requestId', value: CORE_REQUEST_ID },
          ],
          [
            { field: 'sourceAccount', value: 'confinfo' },
            { field: '@requestId', value: CORE_REQUEST_ID },
          ],
        ],
      ],
    ]),
    vars: new Map([['lambdaRequestId', CORE_REQUEST_ID]]),
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
          query.endsWith('| limit 1000') &&
          paginateResults === true,
      ),
    );
    assert.deepStrictEqual(
      result.output?.map((row) => row.find((field) => field.field === 'sourceAccount')?.value),
      ['core', 'confinfo'],
    );
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.queryExecutions.length, 2);
  });

  it('matches configured profile names when an entry declares a fallback', async () => {
    const calls: QueryCall[] = [];
    const input = context([['awsProfiles', 'sso_pn-core-prod,sso_pn-confinfo-prod:sso_pn-core-prod']], calls);

    const result = await new QueryBothLambdaAccountsStep('errors').execute(input);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(
      calls.map(({ accountId, profile }) => ({ accountId, profile })),
      [
        { accountId: '510769970275', profile: 'sso_pn-core-prod' },
        { accountId: '350578575906', profile: 'sso_pn-confinfo-prod' },
      ],
    );
  });

  it('uses OAM for the account without a configured profile in account-aware execution', async () => {
    for (const [awsAccountId, awsProfiles, expectedProfiles] of [
      ['510769970275', 'sso_pn-core-prod_readonly', ['sso_pn-core-prod_readonly', undefined]],
      ['350578575906', 'sso_pn-confinfo-prod', [undefined, 'sso_pn-confinfo-prod']],
    ] as const) {
      const calls: QueryCall[] = [];
      const input = context(
        [
          ['awsAccountId', awsAccountId],
          ['awsProfiles', awsProfiles],
        ],
        calls,
      );

      const result = await new QueryBothLambdaAccountsStep('errors').execute(input);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(
        calls.map(({ accountId, profile }) => ({ accountId, profile })),
        [
          { accountId: '510769970275', profile: expectedProfiles[0] },
          { accountId: '350578575906', profile: expectedProfiles[1] },
        ],
      );
    }
  });

  it('requires both production profiles in local execution', async () => {
    const calls: QueryCall[] = [];
    const input = context([['awsProfiles', 'sso_pn-core-prod_readonly']], calls);

    const result = await new QueryBothLambdaAccountsStep('errors').execute(input);

    assert.strictEqual(result.success, false);
    assert.deepStrictEqual(calls, []);
  });

  it('bounds invocation reconstruction in both accounts', async () => {
    const calls: QueryCall[] = [];
    const input = context([['awsProfiles', 'sso_pn-core-prod_readonly,sso_pn-confinfo-prod']], calls);
    const result = await new QueryBothLambdaAccountsStep('invocation').execute(input);

    assert.strictEqual(result.success, true);
    assert.strictEqual(calls.length, 2);
    assert.ok(
      calls.every(
        ({ query, paginateResults }) =>
          query.includes("@requestId = 'b95bb742-cc30-4f07-80bc-45a38011e5c4'") &&
          query.endsWith('| limit 1000') &&
          paginateResults === true,
      ),
    );
  });

  it('queries every distinct request ID only in its source account', async () => {
    const calls: QueryCall[] = [];
    const input = context([['awsProfiles', 'sso_pn-core-prod_readonly,sso_pn-confinfo-prod']], calls);
    (input.stepResults as Map<string, unknown>).set('query-lambda-errors', [
      [
        { field: 'sourceAccount', value: 'core' },
        { field: '@requestId', value: CORE_REQUEST_ID },
      ],
      [
        { field: 'sourceAccount', value: 'core' },
        { field: '@requestId', value: CORE_REQUEST_ID },
      ],
      [
        { field: 'sourceAccount', value: 'core' },
        { field: '@requestId', value: SECOND_CORE_REQUEST_ID },
      ],
      [
        { field: 'sourceAccount', value: 'confinfo' },
        { field: '@message', value: `ERROR RequestId: ${CONFINFO_REQUEST_ID}` },
      ],
    ]);

    const result = await new QueryBothLambdaAccountsStep('invocation').execute(input);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(
      calls.map(({ accountId, query }) => ({
        accountId,
        coreRequestId: query.includes(CORE_REQUEST_ID),
        secondCoreRequestId: query.includes(SECOND_CORE_REQUEST_ID),
        confinfoRequestId: query.includes(CONFINFO_REQUEST_ID),
        bounded: query.endsWith('| limit 1000'),
      })),
      [
        {
          accountId: '510769970275',
          coreRequestId: true,
          secondCoreRequestId: false,
          confinfoRequestId: false,
          bounded: true,
        },
        {
          accountId: '510769970275',
          coreRequestId: false,
          secondCoreRequestId: true,
          confinfoRequestId: false,
          bounded: true,
        },
        {
          accountId: '350578575906',
          coreRequestId: false,
          secondCoreRequestId: false,
          confinfoRequestId: true,
          bounded: true,
        },
      ],
    );
    assert.deepStrictEqual(
      result.output?.map((row) => row.find((field) => field.field === 'sourceAccount')?.value),
      ['core', 'core', 'confinfo'],
    );
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.queryExecutions.length, 3);
  });

  it('skips an account without a request ID and reports zero when no IDs are available', async () => {
    const calls: QueryCall[] = [];
    const input = context([['awsProfiles', 'sso_pn-core-prod_readonly,sso_pn-confinfo-prod']], calls);
    (input.stepResults as Map<string, unknown>).set('query-lambda-errors', [
      [
        { field: 'sourceAccount', value: 'confinfo' },
        { field: '@requestId', value: CONFINFO_REQUEST_ID },
      ],
    ]);

    const result = await new QueryBothLambdaAccountsStep('invocation').execute(input);
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(
      calls.map(({ accountId }) => accountId),
      ['350578575906'],
    );
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.queryExecutions.length, 1);

    (input.stepResults as Map<string, unknown>).set('query-lambda-errors', [
      [
        { field: 'sourceAccount', value: 'core' },
        { field: '@message', value: 'ERROR without request ID' },
      ],
    ]);
    const noIds = await new QueryBothLambdaAccountsStep('invocation').execute(input);
    assert.strictEqual(noIds.success, true);
    assert.deepStrictEqual(noIds.output, []);
    assert.strictEqual(noIds.vars?.['lambdaInvocationLogCount'], '0');
    assert.strictEqual(calls.length, 1);
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
