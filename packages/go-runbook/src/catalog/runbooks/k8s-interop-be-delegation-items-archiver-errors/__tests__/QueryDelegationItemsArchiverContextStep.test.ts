import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AWSCloudWatchLogsQueryOptions } from '@go-automation/go-common/aws';
import type { RunbookContext } from '../../framework.js';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import { QueryDelegationItemsArchiverContextStep } from '../QueryDelegationItemsArchiverContextStep.js';

const VARS = [
  ['interopLogGroup', '/aws/eks/interop-eks-cluster-prod/application'],
  ['interopPodApp', 'interop-be-delegation-items-archiver'],
  ['interopEnvironment', 'prod'],
] as const;
interface Call {
  readonly groups: ReadonlyArray<string>;
  readonly query: string;
  readonly range: { readonly start: Date; readonly end: Date };
  readonly options: AWSCloudWatchLogsQueryOptions;
}
function context(
  calls: Call[],
  vars: ReadonlyArray<readonly [string, string]> = VARS,
  count = 1,
  matched = count,
  denied = false,
): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date(),
    vars: new Map(vars),
    params: new Map([
      ['startTime', '2026-10-06T18:09:08Z'],
      ['endTime', '2026-10-06T18:19:08Z'],
    ]),
    stepResults: new Map(),
    logs: [],
    recoveredErrors: [],
    services: createTestServiceRegistry({
      cloudWatchLogs: {
        // eslint-disable-next-line @typescript-eslint/require-await
        async queryWithStatistics(
          groups: ReadonlyArray<string>,
          query: string,
          range: { start: Date; end: Date },
          options: AWSCloudWatchLogsQueryOptions,
        ) {
          calls.push({ groups, query, range, options });
          if (denied) throw new Error('AccessDenied');
          return {
            rows: Array.from({ length: count }, () => [{ field: 'log', value: 'WARN - Error during restart service' }]),
            statistics: { recordsMatched: matched, recordsScanned: matched, bytesScanned: 1 },
            queryExecutions: [],
          };
        },
      },
    }),
  };
}
describe('QueryDelegationItemsArchiverContextStep', () => {
  it('reads all log levels in the correct namespace without CID and forwards cancellation', async () => {
    const calls: Call[] = [];
    const signal = new AbortController().signal;
    const result = await new QueryDelegationItemsArchiverContextStep().execute({ ...context(calls), signal });
    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(calls[0]?.groups, [VARS[0][1]]);
    assert.match(calls[0]?.query ?? '', /filter pod_app = "interop-be-delegation-items-archiver"/);
    assert.match(calls[0]?.query ?? '', /filter pod_namespace = "prod"/);
    assert.doesNotMatch(calls[0]?.query ?? '', /ERROR|\bcid\b/i);
    assert.deepStrictEqual(calls[0]?.options, {
      signal,
      paginateResults: true,
      logGroupResolutionMode: 'search-configured-profiles',
    });
    assert.deepStrictEqual(calls[0]?.range, {
      start: new Date('2026-10-06T18:09:08Z'),
      end: new Date('2026-10-06T18:19:08Z'),
    });
    assert.deepStrictEqual(result.vars, { delegationItemsArchiverContextLogCount: '1' });
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.rowsReturned, 1);
  });
  it('rejects missing or blank resolved variables before querying', async () => {
    for (let index = 0; index < VARS.length; index += 1)
      for (const vars of [
        VARS.filter((_, i) => i !== index),
        VARS.map(([key, value], i) => [key, i === index ? ' ' : value] as const),
      ]) {
        const calls: Call[] = [];
        const result = await new QueryDelegationItemsArchiverContextStep().execute(context(calls, vars));
        assert.strictEqual(result.success, false);
        assert.match(result.error ?? '', /Missing resolved INTEROP delegation items archiver context/);
        assert.deepStrictEqual(calls, []);
      }
  });
  it('escapes service values and uses the resolved att namespace', async () => {
    const calls: Call[] = [];
    const input = context(calls, [VARS[0], ['interopPodApp', 'archiver" or true or "'], ['interopEnvironment', 'att']]);
    const step = new QueryDelegationItemsArchiverContextStep();
    assert.strictEqual((await step.execute(input)).success, true);
    assert.ok(calls[0]?.query.includes('filter pod_app = "archiver\\" or true or \\""'));
    assert.match(calls[0]?.query ?? '', /filter pod_namespace = "att"/);
    assert.strictEqual(step.getTraceInfo(input)['environment'], 'att');
  });
  it('accepts zero or complete evidence and refuses saturated or partial results', async () => {
    const step = new QueryDelegationItemsArchiverContextStep();
    for (const count of [0, 999]) assert.strictEqual((await step.execute(context([], VARS, count))).success, true);
    for (const [count, matched] of [
      [1000, 1000],
      [10, 11],
    ]) {
      const result = await step.execute(context([], VARS, count, matched));
      assert.strictEqual(result.success, false);
      assert.match(result.error ?? '', /Archiver context is incomplete/);
      assert.strictEqual(result.output, undefined);
      assert.strictEqual(result.vars, undefined);
    }
  });
  it('reports failed AWS access instead of successful empty evidence', async () => {
    const result = await new QueryDelegationItemsArchiverContextStep().execute(context([], VARS, 1, 1, true));
    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /Delegation items archiver context failed: AccessDenied/);
    assert.strictEqual(result.output, undefined);
  });
});
