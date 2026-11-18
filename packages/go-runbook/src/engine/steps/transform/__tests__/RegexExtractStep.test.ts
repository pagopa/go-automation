import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import { RegexExtractStep } from '../RegexExtractStep.js';

describe('RegexExtractStep', () => {
  const base = {
    id: 'extract-trace',
    label: 'Extract trace id',
    fromStep: 'query',
    fieldPath: '[0].message',
    pattern: 'traceId=([0-9a-f-]+)',
    group: 1,
    saveAs: 'traceId',
  } as const;

  function withMessage(message: string): ReturnType<typeof createTestContext> {
    return createTestContext({ stepResults: { query: [{ message }] } });
  }

  it('extracts the requested capture group, or the whole match with group 0', async () => {
    const result = await new RegexExtractStep(base).execute(withMessage('boom traceId=1-abc-def rest'));
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, '1-abc-def');
    assert.deepStrictEqual(result.vars, { traceId: '1-abc-def' });

    const whole = await new RegexExtractStep({ ...base, group: 0 }).execute(withMessage('boom traceId=1-abc rest'));
    assert.strictEqual(whole.output, 'traceId=1-abc');
  });

  it('succeeds with an undefined output and an empty var when nothing matches', async () => {
    const result = await new RegexExtractStep(base).execute(withMessage('no trace here'));

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, undefined);
    assert.deepStrictEqual(result.vars, { traceId: '' });
  });

  it('fails when the field path resolves to nothing', async () => {
    const result = await new RegexExtractStep({ ...base, fieldPath: '[0].missing' }).execute(withMessage('x'));

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /resolved to undefined/u);
  });
});
