import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import { LogStep } from '../LogStep.js';

describe('LogStep', () => {
  it('saves the interpolated message and level under the step id, keeping unresolved placeholders', async () => {
    const step = new LogStep({
      id: 'log-summary',
      label: 'Log summary',
      level: 'info',
      message: 'Alarm {{params.alarmName}} on {{vars.service}} [{{vars.missing}}]',
    });

    const result = await step.execute(
      createTestContext({ vars: { service: 'pn-delivery' }, params: { alarmName: 'B2B' } }),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.next, 'continue');
    assert.deepStrictEqual(result.vars, {
      'log-summary.message': 'Alarm B2B on pn-delivery [{{vars.missing}}]',
      'log-summary.level': 'info',
    });
  });
});
