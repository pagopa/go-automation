import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { QueryLambdaInvocationStep } from '../QueryLambdaInvocationStep.js';
import type { StepResult } from '../../../../../../engine/types/StepResult.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

const step = new QueryLambdaInvocationStep({
  id: 'query-lambda-invocation',
  label: 'Ricostruzione flusso per requestId',
  lambdaLogGroup: '/aws/lambda/pn-x',
  queryTemplate: 'fields @timestamp, @message | filter {{REQUEST_ID_FILTER}}',
  timeRangeFromParams: { start: 'startTime', end: 'endTime' },
});

describe('QueryLambdaInvocationStep', () => {
  it('no-ops (no CloudWatch query) when the error scan has no request id', async () => {
    const result = await step.execute(createTestContext({ stepResults: { 'query-lambda-errors': [] } }));
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars?.['lambdaInvocationLogCount'], '0');
    assert.deepStrictEqual(result.output, []);
  });

  it('reconstructs every request id of the error scan, a batch per query', async () => {
    const queries: string[] = [];
    const ids = Array.from({ length: 30 }, (_, index) => `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`);
    const result = await step.execute(
      createTestContext({
        stepResults: { 'query-lambda-errors': ids.map((id) => [{ field: '@requestId', value: id }]) },
        params: { startTime: '2026-01-01T00:00:00.000Z', endTime: '2026-01-01T00:10:00.000Z' },
        services: {
          cloudWatchLogs: {
            query: async (_groups: ReadonlyArray<string>, query: string) => {
              queries.push(query);
              const asked = /@requestId = '([^']+)'/.exec(query)?.[1] ?? '';
              return Promise.resolve([
                [
                  { field: '@requestId', value: asked },
                  { field: '@message', value: 'flow' },
                ],
              ]);
            },
          },
        },
      }),
    );
    assert.strictEqual(result.success, true);
    assert.strictEqual(queries.length, 2);
    assert.ok(queries[0]?.includes(`@requestId = '${ids[0] ?? ''}'`));
    assert.ok(queries[1]?.includes(`@requestId = '${ids[29] ?? ''}'`));
    assert.strictEqual(result.output?.length, 2);
  });

  it('declares a failed batch unavailable for its request ids and fails on a configuration error', async () => {
    const ids = Array.from({ length: 30 }, (_, index) => `00000000-0000-0000-0000-${String(index).padStart(12, '0')}`);
    const run = async (error: Error): Promise<StepResult<unknown>> =>
      step.execute(
        createTestContext({
          stepResults: { 'query-lambda-errors': ids.map((id) => [{ field: '@requestId', value: id }]) },
          params: { startTime: '2026-01-01T00:00:00.000Z', endTime: '2026-01-01T00:10:00.000Z' },
          services: {
            cloudWatchLogs: {
              query: async (_groups: ReadonlyArray<string>, query: string) => {
                await Promise.resolve();
                if (query.includes(ids[29] ?? '')) throw error;
                return [];
              },
            },
          },
        }),
      );
    const partial = await run(new Error('ThrottlingException'));
    assert.strictEqual(partial.success, true);
    assert.deepStrictEqual(
      partial.coverage?.map(({ reason, identifiers }) => [reason, identifiers?.map(({ value }) => value)]),
      [['unavailable', ids.slice(25)]],
    );
    const misconfigured = await run(Object.assign(new Error('region mismatch'), { code: 'OAM_REGION_MISMATCH' }));
    assert.strictEqual(misconfigured.success, false);
    assert.match(misconfigured.error ?? '', /region mismatch/);
  });
});
