import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { queryAthena } from '../AthenaQueryStep.js';
import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { ServiceRegistry, AthenaQueryOptions } from '../../../services/index.js';

interface AthenaCall {
  readonly database: string;
  readonly query: string;
  readonly options?: AthenaQueryOptions;
}

function makeContext(params: ReadonlyArray<readonly [string, string]> = []): {
  readonly context: RunbookContext;
  readonly calls: AthenaCall[];
} {
  const calls: AthenaCall[] = [];
  const services = {
    athena: {
      async query(
        database: string,
        query: string,
        options?: AthenaQueryOptions,
      ): Promise<ReadonlyArray<Record<string, string>>> {
        calls.push({
          database,
          query,
          ...(options !== undefined ? { options } : {}),
        });
        await Promise.resolve();
        return [{ ok: 'true' }];
      },
    },
  } as unknown as ServiceRegistry;

  return {
    calls,
    context: {
      executionId: 'test',
      startedAt: new Date('2026-01-01T00:00:00.000Z'),
      stepResults: new Map(),
      vars: new Map(),
      params: new Map(params),
      logs: [],
      services,
      recoveredErrors: [],
    },
  };
}

describe('AthenaQueryStep', () => {
  it('passes inline outputLocation to the Athena service', async () => {
    const step = queryAthena({
      id: 'athena',
      label: 'Athena',
      database: 'db',
      query: "select * from table where id = '{{params.id}}'",
      outputLocation: 's3://bucket/results/',
    });
    const { context, calls } = makeContext([['id', 'ABC']]);

    const result = await step.execute(context);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(calls, [
      {
        database: 'db',
        query: "select * from table where id = '?'",
        options: {
          parameters: ['ABC'],
          outputLocation: 's3://bucket/results/',
        },
      },
    ]);
  });

  it('resolves outputLocation from runbook params', async () => {
    const step = queryAthena({
      id: 'athena',
      label: 'Athena',
      database: 'db',
      query: 'select 1',
      outputLocationParam: 'athenaOutputLocation',
    });
    const { context, calls } = makeContext([['athenaOutputLocation', '  s3://bucket/from-param/  ']]);

    const result = await step.execute(context);

    assert.strictEqual(result.success, true);
    assert.strictEqual(calls[0]?.options?.outputLocation, 's3://bucket/from-param/');
  });

  it('omits outputLocation when neither inline config nor param config is set', async () => {
    const step = queryAthena({
      id: 'athena',
      label: 'Athena',
      database: 'db',
      query: 'select 1',
    });
    const { context, calls } = makeContext();

    const result = await step.execute(context);

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(calls[0]?.options, { parameters: [] });
  });

  it('fails clearly when outputLocationParam is configured but missing', async () => {
    const step = queryAthena({
      id: 'athena',
      label: 'Athena',
      database: 'db',
      query: 'select 1',
      outputLocationParam: 'athenaOutputLocation',
    });
    const { context, calls } = makeContext();

    const result = await step.execute(context);

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /Athena output location param "athenaOutputLocation" is missing or empty/);
    assert.deepStrictEqual(calls, []);
  });
});
