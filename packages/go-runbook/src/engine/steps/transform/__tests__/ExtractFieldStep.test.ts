import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import { ExtractFieldStep } from '../ExtractFieldStep.js';

describe('ExtractFieldStep', () => {
  const base = { id: 'extract', label: 'Extract', fromStep: 'query', fieldPath: '[0].status', saveAs: 'status' };
  const withRows = createTestContext({ stepResults: { query: [{ status: 502 }] } });

  it('navigates the field path and saves the value as a string', async () => {
    const result = await new ExtractFieldStep(base).execute(withRows);

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, '502');
    assert.deepStrictEqual(result.vars, { status: '502' });
  });

  it('fails when the upstream output or the field is missing', async () => {
    const noOutput = await new ExtractFieldStep(base).execute(createTestContext());
    assert.match(noOutput.error ?? '', /Step output not found: "query"/u);
    const noField = await new ExtractFieldStep({ ...base, fieldPath: '[0].missing' }).execute(withRows);
    assert.match(noField.error ?? '', /resolved to undefined/u);
    assert.deepStrictEqual([noOutput.success, noField.success], [false, false]);
  });
});
