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
    assert.deepStrictEqual(
      result.coverage?.map((entry) => entry.reason),
      ['skipped'],
    );
  });

  it('queries a single identifier, escaped, and returns the rows', async () => {
    const { context, queries } = recording({ xRayTraceId: "trace'1" });

    const result = await step().execute(context);

    assert.deepStrictEqual(result.output, ROWS);
    assert.strictEqual(queries.length, 1);
    assert.match(queries[0] ?? '', /filter \(@message like \/trace'1\/\)/);
    assert.doesNotMatch(queries[0] ?? '', /\bor\b/);
  });

  it('looks up a trace id in the given, X-Ray and compact forms, and keeps only the rows of that trace', async () => {
    const trace = '1-6789ABCD-0123456789abcdef01234567';
    const own = logRow({ '@message': 'Ending process', trace_id: '6789abcd0123456789abcdef01234567' });
    const other = logRow({
      '@message': 'Ending process 6789abcd0123456789abcdef01234567',
      trace_id: '1-00000000-111111111111111111111111',
    });
    const unfielded = logRow({ '@message': 'Checking passed' });
    const queries: string[] = [];
    const query = async (
      _groups: ReadonlyArray<string>,
      text: string,
    ): Promise<ReadonlyArray<GOLogsInsightsResultField[]>> => {
      await Promise.resolve();
      queries.push(text);
      return [own, other, unfielded];
    };
    const context = createTestContext({
      vars: { xRayTraceId: trace },
      params: TEST_TIME_RANGE_PARAMS,
      services: { cloudWatchLogs: { query } },
    });

    const result = await step().execute(context);

    assert.deepStrictEqual(result.output, [own, unfielded]);
    assert.match(
      queries[0] ?? '',
      new RegExp(
        `filter \\(@message like /${trace}\\|1-6789abcd-0123456789abcdef01234567\\|` +
          `6789abcd0123456789abcdef01234567/\\)`,
      ),
    );
  });

  it('reads a fallback UUID with a single predicate', async () => {
    const { context, queries } = recording({
      xRayTraceId: '1-6789abcd-0123456789abcdef01234567',
      fallbackUuid: 'uuid-1',
    });

    const result = await step().execute(context);

    assert.deepStrictEqual(result.output, ROWS);
    assert.match(queries[0] ?? '', /filter \(@message like 'uuid-1'\)/);
    assert.doesNotMatch(queries[0] ?? '', /\bor\b/);
  });

  it('prefers the fallback UUID over a blank or present trace id', async () => {
    for (const xRayTraceId of ['1-abc', '   ']) {
      const { context, queries } = recording({ xRayTraceId, fallbackUuid: 'uuid-1' });
      await step().execute(context);
      assert.match(queries[0] ?? '', /filter \(@message like 'uuid-1'\)/);
      assert.doesNotMatch(queries[0] ?? '', /1-abc|\bor\b/);
    }
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
