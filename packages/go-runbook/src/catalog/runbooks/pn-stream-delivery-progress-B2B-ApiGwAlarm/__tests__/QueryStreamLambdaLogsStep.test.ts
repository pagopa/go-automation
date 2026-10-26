import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ResultField } from '@go-automation/go-common/aws';
import { QueryStreamLambdaLogsStep } from '../QueryStreamLambdaLogsStep.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import type { RunbookContext } from '../../../../types/RunbookContext.js';

const ID = 'a2240f30-32dc-407d-80d9-4fd363aeaeb4';
const OTHER_ID = 'b2240f30-32dc-407d-80d9-4fd363aeaeb4';
const row = (fields: Record<string, string>): ResultField[] =>
  Object.entries(fields).map(([field, value]) => ({ field, value }));
const step = new QueryStreamLambdaLogsStep({
  id: 'lambda',
  label: 'Lambda',
  logGroup: '/aws/lambda/stream-test',
  requestIdField: 'authorizerRequestId',
});

function context(
  rows: ResultField[][],
  query: unknown = async () => {
    await Promise.resolve();
    return [];
  },
): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date(),
    vars: new Map(),
    logs: [],
    recoveredErrors: [],
    params: new Map([
      ['startTime', '2026-10-16T08:10:00Z'],
      ['endTime', '2026-10-16T08:20:00Z'],
    ]),
    stepResults: new Map([['query-api-gw-logs', rows]]),
    services: createTestServiceRegistry({ cloudWatchLogs: { query } }),
  };
}

describe('QueryStreamLambdaLogsStep', () => {
  it('queries only failing authorizer invocation IDs, deduplicates and uses configured source resolution', async () => {
    const failed = row({ status: '500', authorizerStatus: '500', authorizerRequestId: ID });
    let calls = 0;
    const ctx = context(
      [failed, failed, row({ status: '500', authorizerStatus: '200', authorizerRequestId: OTHER_ID })],
      async (groups: string[], query: string, _time: unknown, options: unknown) => {
        await Promise.resolve();
        calls++;
        assert.deepEqual(groups, ['/aws/lambda/stream-test']);
        assert.match(query, new RegExp(ID));
        assert.equal(query.split(ID).length, 2);
        assert.ok(!query.includes(OTHER_ID));
        assert.deepEqual(options, { logGroupResolutionMode: 'search-configured-profiles' });
        return [
          row({ '@requestId': ID, '@message': 'REPORT RequestId: test Status: timeout' }),
          row({ '@requestId': OTHER_ID, '@message': 'Unrelated error' }),
        ];
      },
    );
    const result = await step.execute(ctx);
    assert.equal(result.success, true);
    assert.equal(result.output?.length, 1);
    assert.equal(result.vars?.['lambda'], 'queried');
    assert.equal(result.next, 'resolve');
    assert.equal(calls, 1);
    assert.deepEqual(step.getTraceInfo()['logGroups'], ['/aws/lambda/stream-test']);
  });

  for (const id of ['-', '', 'N/A', "x' or true", 'not-a-uuid']) {
    it(`skips missing or unsafe invocation identifier ${JSON.stringify(id)}`, async () => {
      const result = await step.execute(
        context([row({ authorizerStatus: '500', authorizerRequestId: id })], () => assert.fail('Unexpected query')),
      );
      assert.equal(result.vars?.['lambda'], 'no-request-id');
      assert.deepEqual(result.output, []);
    });
  }

  it('distinguishes unavailable queries from empty completed queries', async () => {
    const rows = [row({ authorizerStatus: '500', authorizerRequestId: ID })];
    const unavailable = await step.execute(
      context(rows, async () => {
        await Promise.resolve();
        throw new Error('AccessDenied');
      }),
    );
    assert.equal(unavailable.vars?.['lambda'], 'unavailable');
    assert.equal(unavailable.vars?.['lambda-reason'], 'AccessDenied');
    assert.equal(unavailable.next, undefined);
    const empty = await step.execute(context(rows));
    assert.equal(empty.vars?.['lambda'], 'queried');
    assert.deepEqual(empty.output, []);
  });

  it('queries versioning by integrationRequestId for client errors too', async () => {
    const versioning = new QueryStreamLambdaLogsStep({
      id: 'versioning',
      label: 'Versioning',
      logGroup: '/aws/lambda/versioning-test',
      requestIdField: 'integrationRequestId',
    });
    const ctx = context(
      [row({ status: '403', integrationRequestId: ID, path: '/delivery-progresses/v2.3/streams/test/events' })],
      async (_groups: unknown, query: string) => {
        await Promise.resolve();
        assert.match(query, new RegExp(ID));
        return [
          row({ '@requestId': ID, '@message': 'PN_GENERIC_ERROR AxiosError: Request failed with status code 403' }),
        ];
      },
    );
    const controller = new AbortController();
    const result = await versioning.execute({ ...ctx, signal: controller.signal });
    assert.equal(result.output?.length, 1);
    assert.equal(result.vars?.['versioning'], 'queried');
  });

  it('does not scan successful requests or silently truncate too many identifiers', async () => {
    const success = await step.execute(
      context([row({ authorizerStatus: '200', authorizerRequestId: ID })], () => assert.fail('Unexpected query')),
    );
    assert.equal(success.vars?.['lambda'], 'no-request-id');
    const many = Array.from({ length: 101 }, (_, index) =>
      row({
        authorizerStatus: '500',
        authorizerRequestId: `${index.toString(16).padStart(8, '0')}-32dc-407d-80d9-4fd363aeaeb4`,
      }),
    );
    const result = await step.execute(context(many, () => assert.fail('Unexpected query')));
    assert.equal(result.vars?.['lambda'], 'too-many-request-ids');
  });

  it('reports missing upstream output and invalid time ranges', async () => {
    const ctx = context([]);
    assert.equal((await step.execute({ ...ctx, stepResults: new Map() })).success, false);
    const invalid = context([row({ authorizerStatus: '500', authorizerRequestId: ID })]);
    assert.equal((await step.execute({ ...invalid, params: new Map() })).success, false);
  });
  it('does not read versioning Lambda logs for the v2.9 HTTP integration', async () => {
    const versioning = new QueryStreamLambdaLogsStep({
      id: 'versioning',
      label: 'Versioning',
      logGroup: '/aws/lambda/versioning-test',
      requestIdField: 'integrationRequestId',
    });
    const result = await versioning.execute(
      context(
        [row({ status: '500', integrationRequestId: ID, path: '/delivery-progresses/v2.9/streams/test/events' })],
        () => assert.fail('Unexpected Lambda query'),
      ),
    );
    assert.equal(result.vars?.['versioning'], 'no-request-id');
  });
});
