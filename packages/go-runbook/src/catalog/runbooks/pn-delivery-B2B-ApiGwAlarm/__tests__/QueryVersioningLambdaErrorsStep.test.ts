import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ResultField } from '@go-automation/go-common/aws';

import type { RunbookContext } from '../../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../../services/createTestServiceRegistry.js';

import { QueryVersioningLambdaErrorsStep } from '../QueryVersioningLambdaErrorsStep.js';
import { VERSIONING_LAMBDA_LOG_GROUP } from '../knownServices.js';
import {
  VERSIONING_LAMBDA_ERROR_COUNT_VAR,
  VERSIONING_LAMBDA_ERROR_MESSAGE_VAR,
  VERSIONING_LAMBDA_PROBE_STATE_VAR,
  VERSIONING_LAMBDA_PROBE_STEP_ID,
  VERSIONING_LAMBDA_UNAVAILABLE_REASON_VAR,
} from '../versioningLambdaProbe.js';

type CloudWatchQueryFn = (
  logGroups: ReadonlyArray<string>,
  queryString: string,
) => Promise<ReadonlyArray<ReadonlyArray<ResultField>>>;

function row(fields: Record<string, string>): ResultField[] {
  return Object.entries(fields).map(([field, value]) => ({ field, value }));
}

function buildContext(vars: Readonly<Record<string, string>>, query: CloudWatchQueryFn): RunbookContext {
  return {
    executionId: 'versioning-lambda-probe-test',
    startedAt: new Date('2026-09-01T10:00:00.000Z'),
    stepResults: new Map(),
    vars: new Map(Object.entries(vars)),
    params: new Map([
      ['startTime', '2026-09-01T09:55:00.000Z'],
      ['endTime', '2026-09-01T10:05:00.000Z'],
    ]),
    logs: [],
    services: createTestServiceRegistry({ cloudWatchLogs: { query } }),
    recoveredErrors: [],
  };
}

function step(): QueryVersioningLambdaErrorsStep {
  return new QueryVersioningLambdaErrorsStep({
    id: VERSIONING_LAMBDA_PROBE_STEP_ID,
    label: 'Verifica errori Lambda versioning',
    lambdaLogGroup: VERSIONING_LAMBDA_LOG_GROUP,
    timeRangeFromParams: { start: 'startTime', end: 'endTime' },
  });
}

describe('QueryVersioningLambdaErrorsStep', () => {
  it('skips CloudWatch unless a correlated API Gateway 500 has zero pn-delivery errors', async () => {
    let queryCalls = 0;
    const context = buildContext(
      {
        apiGwStatusCode: '504',
        deliveryLogCount: '0',
        apiGwCurrentQueryIdentifierMode: 'trace',
      },
      async () => {
        queryCalls += 1;
        return Promise.resolve([]);
      },
    );

    const result = await step().execute(context);

    assert.strictEqual(result.success, true);
    // Nothing was corroborated here, so the probe must not trigger an early
    // known-case evaluation: the traversal still has to run.
    assert.strictEqual(result.next, 'continue');
    assert.strictEqual(queryCalls, 0);
    assert.strictEqual(result.vars?.[VERSIONING_LAMBDA_PROBE_STATE_VAR], 'skipped');
    assert.strictEqual(result.vars?.[VERSIONING_LAMBDA_ERROR_COUNT_VAR], '');
  });

  it('still probes when the pn-delivery query had no correlation identifier', async () => {
    // Real occurrences of the documented case carry no trace id, precisely
    // because nothing logged an error. Gating on one made the case unmatchable
    // in production while the fixtures kept passing.
    let queryCalls = 0;
    const context = buildContext(
      {
        apiGwStatusCode: '500',
        deliveryLogCount: '0',
        apiGwCurrentQueryIdentifierMode: 'none',
      },
      async () => {
        queryCalls += 1;
        return Promise.resolve([]);
      },
    );

    const result = await step().execute(context);

    assert.strictEqual(queryCalls, 1);
    assert.strictEqual(result.vars?.[VERSIONING_LAMBDA_PROBE_STATE_VAR], 'queried');
    assert.strictEqual(result.vars?.[VERSIONING_LAMBDA_ERROR_COUNT_VAR], '0');
  });

  it('skips when the shape is not the documented one', async () => {
    let queryCalls = 0;
    const context = buildContext({ apiGwStatusCode: '504', deliveryLogCount: '0' }, async () => {
      queryCalls += 1;
      return Promise.resolve([]);
    });

    const result = await step().execute(context);

    assert.strictEqual(queryCalls, 0);
    assert.strictEqual(result.vars?.[VERSIONING_LAMBDA_PROBE_STATE_VAR], 'skipped');
  });

  it('records a successful query with zero Lambda errors', async () => {
    const calls: { readonly logGroups: ReadonlyArray<string>; readonly query: string }[] = [];
    const context = buildContext(
      {
        apiGwStatusCode: '500',
        deliveryLogCount: '0',
        apiGwCurrentQueryIdentifierMode: 'trace',
      },
      async (logGroups, query) => {
        calls.push({ logGroups, query });
        return Promise.resolve([]);
      },
    );

    const result = await step().execute(context);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.next, 'resolve');
    assert.deepStrictEqual(calls[0]?.logGroups, [VERSIONING_LAMBDA_LOG_GROUP]);
    assert.match(calls[0]?.query ?? '', /Status:\\s\*error/);
    assert.strictEqual(result.vars?.[VERSIONING_LAMBDA_PROBE_STATE_VAR], 'queried');
    assert.strictEqual(result.vars?.[VERSIONING_LAMBDA_ERROR_COUNT_VAR], '0');
    assert.strictEqual(result.vars?.[VERSIONING_LAMBDA_ERROR_MESSAGE_VAR], '');
    assert.strictEqual(result.vars?.[VERSIONING_LAMBDA_UNAVAILABLE_REASON_VAR], '');
  });

  it('keeps the representative Lambda error when rows are returned', async () => {
    const message = '2026-09-01 ERROR Versioning request failed';
    const context = buildContext(
      {
        apiGwStatusCode: '500',
        deliveryLogCount: '0',
        apiGwCurrentQueryIdentifierMode: 'trace',
      },
      async () => Promise.resolve([row({ '@message': message, '@requestId': 'lambda-request-id' })]),
    );

    const result = await step().execute(context);

    assert.strictEqual(result.vars?.[VERSIONING_LAMBDA_PROBE_STATE_VAR], 'queried');
    assert.strictEqual(result.vars?.[VERSIONING_LAMBDA_ERROR_COUNT_VAR], '1');
    assert.strictEqual(result.vars?.[VERSIONING_LAMBDA_ERROR_MESSAGE_VAR], message);
  });

  it('marks a failed query unavailable without writing a zero error count', async () => {
    const context = buildContext(
      {
        apiGwStatusCode: '500',
        deliveryLogCount: '0',
        apiGwCurrentQueryIdentifierMode: 'trace',
      },
      async () => Promise.reject(new Error('CloudWatch retention unavailable')),
    );

    const result = await step().execute(context);

    assert.strictEqual(result.success, true);
    // Nothing was corroborated here, so the probe must not trigger an early
    // known-case evaluation: the traversal still has to run.
    assert.strictEqual(result.next, 'continue');
    assert.strictEqual(result.vars?.[VERSIONING_LAMBDA_PROBE_STATE_VAR], 'unavailable');
    assert.strictEqual(result.vars?.[VERSIONING_LAMBDA_ERROR_COUNT_VAR], '');
    assert.match(result.vars?.[VERSIONING_LAMBDA_UNAVAILABLE_REASON_VAR] ?? '', /retention unavailable/);
  });
});
