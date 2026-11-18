import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AWSAthenaQueryOptions } from '@pagopa/go-aws/athena';
import type { StepResult } from '../../../../../../engine/types/StepResult.js';
import { AthenaQueryStep } from '../AthenaQueryStep.js';
import type { AthenaQueryConfig } from '../AthenaQueryStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

interface AthenaCall {
  readonly database: string;
  readonly query: string;
  readonly options?: AWSAthenaQueryOptions;
}

/** Runs the step against a stub Athena service and returns its result with the recorded calls. */
async function runAthena(
  config: Omit<AthenaQueryConfig, 'id' | 'label' | 'database'>,
  params: Readonly<Record<string, string>> = {},
): Promise<{ readonly result: StepResult<ReadonlyArray<Record<string, string>>>; readonly calls: AthenaCall[] }> {
  const calls: AthenaCall[] = [];
  const query = async (
    database: string,
    sql: string,
    options?: AWSAthenaQueryOptions,
  ): Promise<ReadonlyArray<Record<string, string>>> => {
    calls.push({ database, query: sql, ...(options !== undefined ? { options } : {}) });
    return Promise.resolve([{ ok: 'true' }]);
  };
  const step = new AthenaQueryStep({ id: 'athena', label: 'Athena', database: 'db', ...config });
  const result = await step.execute(createTestContext({ params, services: { athena: { query } } }));
  return { result, calls };
}

describe('AthenaQueryStep', () => {
  it('passes the positional parameters and the inline outputLocation to the Athena service', async () => {
    const { result, calls } = await runAthena(
      { query: "select * from table where id = '{{params.id}}'", outputLocation: 's3://bucket/results/' },
      { id: 'ABC' },
    );

    assert.deepStrictEqual(result, { success: true, output: [{ ok: 'true' }] });
    assert.deepStrictEqual(calls, [
      {
        database: 'db',
        query: "select * from table where id = '?'",
        options: { parameters: ['ABC'], outputLocation: 's3://bucket/results/' },
      },
    ]);
  });

  it('resolves a trimmed outputLocation from runbook params', async () => {
    const { calls } = await runAthena(
      { query: 'select 1', outputLocationParam: 'athenaOutputLocation' },
      { athenaOutputLocation: '  s3://bucket/from-param/  ' },
    );

    assert.strictEqual(calls[0]?.options?.outputLocation, 's3://bucket/from-param/');
  });

  it('omits outputLocation when neither inline config nor param config is set', async () => {
    const { calls } = await runAthena({ query: 'select 1' });

    assert.deepStrictEqual(calls[0]?.options, { parameters: [] });
  });

  it('fails clearly when outputLocationParam is configured but missing', async () => {
    const { result, calls } = await runAthena({ query: 'select 1', outputLocationParam: 'athenaOutputLocation' });

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /Athena output location param "athenaOutputLocation" is missing or empty/);
    assert.deepStrictEqual(calls, []);
  });
});
