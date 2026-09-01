import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../services/createTestServiceRegistry.js';
import { TemplateStep } from '../TemplateStep.js';

function createContext(args: {
  readonly vars?: Record<string, string>;
  readonly params?: Record<string, string>;
  readonly stepResults?: ReadonlyArray<readonly [string, unknown]>;
}): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map<string, unknown>(args.stepResults ?? []),
    vars: new Map(Object.entries(args.vars ?? {})),
    params: new Map(Object.entries(args.params ?? {})),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

describe('TemplateStep', () => {
  it('interpolates vars and params and saves the result', async () => {
    const step = new TemplateStep({
      id: 'build-message',
      label: 'Build message',
      template: 'Alarm {{params.alarmName}} on {{vars.service}}',
      saveAs: 'message',
    });

    const result = await step.execute(
      createContext({ vars: { service: 'pn-delivery' }, params: { alarmName: 'B2B-ApiGwAlarm' } }),
    );

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.output, 'Alarm B2B-ApiGwAlarm on pn-delivery');
    assert.deepStrictEqual(result.vars, { message: 'Alarm B2B-ApiGwAlarm on pn-delivery' });
  });

  it('replaces an unknown placeholder with an empty string', async () => {
    const step = new TemplateStep({
      id: 'build-message',
      label: 'Build message',
      template: 'service=[{{vars.missing}}]',
      saveAs: 'message',
    });

    assert.strictEqual((await step.execute(createContext({}))).output, 'service=[]');
  });

  it('leaves a template without placeholders untouched', async () => {
    const step = new TemplateStep({ id: 'literal', label: 'Literal', template: 'no placeholders', saveAs: 'out' });

    assert.strictEqual((await step.execute(createContext({}))).output, 'no placeholders');
  });
});
