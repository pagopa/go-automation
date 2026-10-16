import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AWSCloudWatchLogsQueryOptions } from '@go-automation/go-common/aws';
import { createTestServiceRegistry } from '../../../../registry/createTestServiceRegistry.js';
import type { RunbookContext } from '../../framework.js';
import { QueryPublicCatalogStrapiContextStep } from '../QueryPublicCatalogStrapiContextStep.js';

interface Call {
  readonly groups: ReadonlyArray<string>;
  readonly query: string;
  readonly range: { readonly start: Date; readonly end: Date };
  readonly options: AWSCloudWatchLogsQueryOptions;
}

const VARS = [
  ['interopLogGroup', '/aws/eks/interop-eks-cluster-prod/application'],
  ['interopPodApp', 'interop-public-catalog-strapi'],
  ['interopEnvironment', 'prod'],
] as const;

function context(
  calls: Call[],
  vars: ReadonlyArray<readonly [string, string]> = VARS,
  count = 1,
  matched = count,
  error?: Error,
): RunbookContext {
  return {
    executionId: 'strapi-test',
    startedAt: new Date('2026-10-06T00:36:08Z'),
    stepResults: new Map(),
    vars: new Map(vars),
    params: new Map([
      ['startTime', '2026-10-06T00:31:08Z'],
      ['endTime', '2026-10-06T00:41:08Z'],
    ]),
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
          if (error !== undefined) throw error;
          return {
            rows: Array.from({ length: count }, () => [{ field: 'log', value: '> strapi start' }]),
            statistics: { bytesScanned: 1, recordsScanned: matched, recordsMatched: matched },
            queryExecutions: [],
          };
        },
      },
    }),
  };
}

describe('QueryPublicCatalogStrapiContextStep', () => {
  it('reads raw stdout/stderr in the resolved namespace without CID or error filters', async () => {
    const calls: Call[] = [];
    const signal = new AbortController().signal;
    const step = new QueryPublicCatalogStrapiContextStep();
    const input = { ...context(calls), signal };
    const result = await step.execute(input);
    assert.strictEqual(result.success, true);
    assert.strictEqual(calls.length, 1);
    assert.deepStrictEqual(calls[0]?.groups, [VARS[0][1]]);
    assert.match(calls[0]?.query ?? '', /filter pod_app = "interop-public-catalog-strapi"/);
    assert.match(calls[0]?.query ?? '', /filter pod_namespace = "prod-public-catalog"/);
    assert.match(calls[0]?.query ?? '', /sort @timestamp asc/);
    assert.doesNotMatch(calls[0]?.query ?? '', /ERROR|\bcid\b|parse log/i);
    assert.deepStrictEqual(calls[0]?.range, {
      start: new Date('2026-10-06T00:31:08Z'),
      end: new Date('2026-10-06T00:41:08Z'),
    });
    assert.deepStrictEqual(calls[0]?.options, {
      signal,
      paginateResults: true,
      logGroupResolutionMode: 'search-configured-profiles',
    });
    assert.deepStrictEqual(result.vars, { publicCatalogStrapiContextLogCount: '1' });
    assert.strictEqual(result.diagnostics?.cloudWatchLogs?.rowsReturned, 1);
    assert.strictEqual(step.getTraceInfo(input)['levels'], 'ALL');
  });

  it('rejects missing or blank context before contacting AWS', async () => {
    for (let index = 0; index < VARS.length; index += 1) {
      for (const vars of [
        VARS.filter((_, i) => i !== index),
        VARS.map(([key, value], i) => [key, i === index ? ' ' : value] as const),
      ]) {
        const calls: Call[] = [];
        const result = await new QueryPublicCatalogStrapiContextStep().execute(context(calls, vars));
        assert.strictEqual(result.success, false);
        assert.match(result.error ?? '', /Missing resolved INTEROP public catalog Strapi context/);
        assert.deepStrictEqual(calls, []);
      }
    }
  });

  it('escapes filter values and supports the resolved att namespace', async () => {
    const calls: Call[] = [];
    const result = await new QueryPublicCatalogStrapiContextStep().execute(
      context(calls, [VARS[0], ['interopPodApp', 'strapi" or true or "'], ['interopEnvironment', 'att']]),
    );
    assert.strictEqual(result.success, true);
    assert.ok(calls[0]?.query.includes('filter pod_app = "strapi\\" or true or \\""'));
    assert.match(calls[0]?.query ?? '', /filter pod_namespace = "att-public-catalog"/);
  });

  it('accepts empty or complete evidence but rejects capped and partial results', async () => {
    const step = new QueryPublicCatalogStrapiContextStep();
    for (const count of [0, 999]) {
      const result = await step.execute(context([], VARS, count));
      assert.strictEqual(result.success, true);
      assert.strictEqual(result.output?.length, count);
    }
    for (const [count, matched] of [
      [1000, 1000],
      [10, 11],
    ]) {
      const result = await step.execute(context([], VARS, count, matched));
      assert.strictEqual(result.success, false);
      assert.match(result.error ?? '', /Strapi context is incomplete/);
      assert.strictEqual(result.output, undefined);
      assert.strictEqual(result.vars, undefined);
    }
  });

  it('reports access errors without returning empty success evidence', async () => {
    const result = await new QueryPublicCatalogStrapiContextStep().execute(
      context([], VARS, 1, 1, new Error('AccessDenied')),
    );
    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /Public catalog Strapi context failed: AccessDenied/);
    assert.strictEqual(result.output, undefined);
  });
});
