import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../registry/createTestServiceRegistry.js';
import { SetVarStep } from '../SetVarStep.js';

function createContext(args: {
  readonly vars?: Record<string, string>;
  readonly params?: Record<string, string>;
}): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map<string, unknown>(),
    vars: new Map(Object.entries(args.vars ?? {})),
    params: new Map(Object.entries(args.params ?? {})),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

describe('SetVarStep', () => {
  it('writes the literal value', async () => {
    const step = new SetVarStep({ id: 'set-env', label: 'Set env', varName: 'environment', value: 'prod' });

    const result = await step.execute(createContext({}));

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.vars, { environment: 'prod' });
  });

  it('interpolates an expression against vars and params', async () => {
    const step = new SetVarStep({
      id: 'set-label',
      label: 'Set label',
      varName: 'label',
      expression: '{{params.alarmName}}/{{vars.service}}',
    });

    const result = await step.execute(
      createContext({ vars: { service: 'pn-delivery' }, params: { alarmName: 'B2B' } }),
    );

    assert.deepStrictEqual(result.vars, { label: 'B2B/pn-delivery' });
  });

  it('prefers the literal value when both value and expression are configured', async () => {
    const step = new SetVarStep({
      id: 'set-env',
      label: 'Set env',
      varName: 'environment',
      value: 'prod',
      expression: '{{vars.ignored}}',
    });

    assert.deepStrictEqual((await step.execute(createContext({ vars: { ignored: 'dev' } }))).vars, {
      environment: 'prod',
    });
  });

  it('writes an empty string when neither value nor expression is configured', async () => {
    const step = new SetVarStep({ id: 'set-env', label: 'Set env', varName: 'environment' });

    assert.deepStrictEqual((await step.execute(createContext({}))).vars, { environment: '' });
  });
});
