import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createTestContext } from '../../../../__tests__/helpers/createTestContext.js';
import { TemplateStep } from '../TemplateStep.js';

describe('TemplateStep', () => {
  it('interpolates vars and params and saves the result', async () => {
    const step = new TemplateStep({
      id: 'build-message',
      label: 'Build message',
      template: 'Alarm {{params.alarmName}} on {{vars.service}}',
      saveAs: 'message',
    });

    const result = await step.execute(
      createTestContext({ vars: { service: 'pn-delivery' }, params: { alarmName: 'B2B-ApiGwAlarm' } }),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, 'Alarm B2B-ApiGwAlarm on pn-delivery');
    assert.deepStrictEqual(result.vars, { message: 'Alarm B2B-ApiGwAlarm on pn-delivery' });
  });

  it('replaces an unknown placeholder with an empty string', async () => {
    const step = new TemplateStep({ id: 'msg', label: 'Msg', template: 'service=[{{vars.missing}}]', saveAs: 'm' });

    assert.strictEqual((await step.execute(createTestContext())).output, 'service=[]');
  });
});
