import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import { MapStep } from '../MapStep.js';

describe('MapStep', () => {
  const step = new MapStep({
    id: 'map',
    label: 'Map',
    fromStep: 'query',
    mappingFn: (element, index) => `${String(index)}:${(element as { readonly id: string }).id}`,
  });

  it('applies the mapping function, with the index, to every element', async () => {
    const result = await step.execute(createTestContext({ stepResults: { query: [{ id: 'a' }, { id: 'b' }] } }));

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.output, ['0:a', '1:b']);
  });

  it('fails when the upstream output is missing or not an array', async () => {
    const notArray = await step.execute(createTestContext({ stepResults: { query: { not: 'an array' } } }));
    assert.match(notArray.error ?? '', /is not an array/u);
    assert.deepStrictEqual([notArray.success, (await step.execute(createTestContext())).success], [false, false]);
  });
});
