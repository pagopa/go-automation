import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOLogsInsightsResultField } from '@pagopa/go-aws/cloudwatch-logs/insights';
import type { GOLogger } from '@pagopa/go-common/logging';

import { QueryServiceLogsStep, type QueryServiceLogsConfig } from '../QueryServiceLogsStep.js';
import { ConsoleRunbookReporter } from '../../../../../../engine/reporting/ConsoleRunbookReporter.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';
import { logRow } from '../../../../../../__tests__/helpers/logRow.js';
import { TEST_TIME_RANGE_PARAMS } from '../../../../../../__tests__/helpers/TEST_TIME_RANGE_PARAMS.js';
import type { OperationalContext } from '../../../../../common/services/OperationalContext.js';

const ROWS: ReadonlyArray<GOLogsInsightsResultField[]> = [
  logRow({ '@message': 'row1' }),
  logRow({ '@message': 'row2' }),
];

function step(overrides: Partial<QueryServiceLogsConfig> = {}): QueryServiceLogsStep {
  return new QueryServiceLogsStep({
    id: 'q',
    label: 'Q',
    serviceName: 'pn-foo',
    entryService: true,
    logGroups: ['/aws/ecs/foo'],
    timeRangeFromParams: { start: 'startTime', end: 'endTime' },
    ...overrides,
  });
}

/** A context whose logs service records every query and answers with `ROWS`. */
function recording(vars: Readonly<Record<string, string>>): { context: OperationalContext; queries: string[] } {
  const queries: string[] = [];
  const query = async (_groups: ReadonlyArray<string>, text: string): Promise<typeof ROWS> => {
    await Promise.resolve();
    queries.push(text);
    return ROWS;
  };
  return {
    context: createTestContext({ vars, params: TEST_TIME_RANGE_PARAMS, services: { cloudWatchLogs: { query } } }),
    queries,
  };
}

describe('QueryServiceLogsStep', () => {
  it('skips the AWS call when no identifier is available', async () => {
    const { context, queries } = recording({});

    const result = await step().execute(context);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, []);
    assert.deepStrictEqual(queries, []);
  });

  it('queries a single identifier, escaped, and returns the rows', async () => {
    const { context, queries } = recording({ xRayTraceId: "trace'1" });

    const result = await step().execute(context);

    assert.strictEqual(result.output, ROWS);
    assert.strictEqual(queries.length, 1);
    assert.match(queries[0] ?? '', /filter @message like 'trace''1'/);
    assert.doesNotMatch(queries[0] ?? '', /\bor\b/);
  });

  it('prefers the fallback UUID over the trace id, read from the profile var', async () => {
    const cases: ReadonlyArray<readonly [Readonly<Record<string, string>>, string | undefined]> = [
      [{ xRayTraceId: '1-abc', fallbackUuid: 'uuid-1' }, undefined],
      [{ xRayTraceId: '   ', fallbackUuid: 'uuid-1' }, undefined],
      [{ customTrace: '1-abc', fallbackUuid: 'uuid-1' }, 'customTrace'],
    ];
    for (const [vars, traceVar] of cases) {
      const { context, queries } = recording(vars);
      await step(traceVar === undefined ? {} : { accessLogSchemaTraceIdContextVar: traceVar }).execute(context);
      assert.match(queries[0] ?? '', /filter @message like 'uuid-1'/);
      assert.doesNotMatch(queries[0] ?? '', /1-abc|\bor\b/);
    }
  });

  it('counts a visit only when entering a new service, and every query', async () => {
    const first = await step().execute(recording({ xRayTraceId: '1-abc' }).context);
    assert.deepStrictEqual(
      ['apiGwVisitCount', 'apiGwLastService', 'apiGwQueryCount', 'apiGwServicesVisited'].map(
        (key) => first.vars?.[key],
      ),
      ['1', 'pn-foo', '1', 'pn-foo|2'],
    );

    const visited = { xRayTraceId: '1-abc', apiGwVisitCount: '1', apiGwLastService: 'pn-foo', apiGwQueryCount: '1' };
    // Re-query of the same service (fallback-uuid retry / trace_id swap): the chain entry is rewritten.
    const again = await step().execute(recording({ ...visited, apiGwServicesVisited: 'pn-foo|1' }).context);
    assert.deepStrictEqual(
      ['apiGwVisitCount', 'apiGwQueryCount', 'apiGwServicesVisited'].map((key) => again.vars?.[key]),
      ['1', '2', 'pn-foo|2'],
    );

    const next = await step({ serviceName: 'pn-bar', entryService: false }).execute(
      recording({ ...visited, apiGwServicesVisited: 'pn-foo|42' }).context,
    );
    assert.deepStrictEqual(
      ['apiGwVisitCount', 'apiGwLastService', 'apiGwQueryCount', 'apiGwServicesVisited'].map((key) => next.vars?.[key]),
      ['2', 'pn-bar', '2', 'pn-foo|42,pn-bar|2'],
    );
  });

  it('reports the failed query before failing the step', async () => {
    const lines: string[] = [];
    const reporter = new ConsoleRunbookReporter({
      text: (line: string) => lines.push(line),
      newline: () => lines.push(''),
    } as unknown as GOLogger);
    const query = async (): Promise<never> => {
      await Promise.resolve();
      throw new Error("[ResourceNotFoundException] Log group '/aws/ecs/pn-data-vault-sep' does not exist");
    };
    const context = createTestContext({
      vars: { xRayTraceId: '1-abc' },
      params: TEST_TIME_RANGE_PARAMS,
      services: { cloudWatchLogs: { query }, reporter },
    });

    const result = await step({ logGroups: ['/aws/ecs/pn-data-vault-sep'] }).execute(context);
    // The reporter holds the last node back; the engine would flush it.
    reporter.flush();

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /CloudWatch service logs query failed/);
    const rendered = lines.join('\n');
    assert.match(rendered, /⚠ Query fallita/);
    assert.match(rendered, /Log group: \/aws\/ecs\/pn-data-vault-sep/);
    assert.match(
      rendered,
      /Causa: \[ResourceNotFoundException\] Log group '\/aws\/ecs\/pn-data-vault-sep' does not exist/,
    );
  });

  it('rejects a query template without the {{FILTER_CLAUSE}} placeholder', () => {
    // Without the placeholder the step would silently scan the whole log group.
    assert.throws(
      () => step({ queryTemplateOverride: 'fields @timestamp, @message | sort @timestamp asc' }),
      /\{\{FILTER_CLAUSE\}\} placeholder/,
    );
  });
});
