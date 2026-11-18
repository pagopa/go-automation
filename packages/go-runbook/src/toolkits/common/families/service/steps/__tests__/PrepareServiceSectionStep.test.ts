import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { PrepareServiceSectionStep } from '../PrepareServiceSectionStep.js';
import { createTestContext } from '../../../../../../__tests__/helpers/createTestContext.js';

describe('PrepareServiceSectionStep', () => {
  it('completes without polluting the shared var scope', async () => {
    const step = new PrepareServiceSectionStep({
      id: 'prepare-service-section',
      label: 'Preparazione servizio',
      serviceName: 'pn-foo',
      logGroup: '/aws/ecs/pn-foo',
    });

    const result = await step.execute(createTestContext());

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars, undefined);
  });
});
