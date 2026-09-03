import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../registry/createTestServiceRegistry.js';
import { LogStep } from '../LogStep.js';

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

describe('LogStep', () => {
  it('saves the interpolated message and level under the step id', async () => {
    const step = new LogStep({
      id: 'log-summary',
      label: 'Log summary',
      level: 'info',
      message: 'Alarm {{params.alarmName}} on {{vars.service}}',
    });

    const result = await step.execute(
      createContext({ vars: { service: 'pn-delivery' }, params: { alarmName: 'B2B' } }),
    );

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.vars, {
      'log-summary.message': 'Alarm B2B on pn-delivery',
      'log-summary.level': 'info',
    });
  });

  it('always continues the pipeline', async () => {
    const step = new LogStep({ id: 'log-error', label: 'Log error', level: 'error', message: 'boom' });

    assert.strictEqual((await step.execute(createContext({}))).next, 'continue');
  });

  it('leaves an unresolved placeholder verbatim', async () => {
    const step = new LogStep({ id: 'log-x', label: 'Log', level: 'warn', message: 'v=[{{vars.missing}}]' });

    const result = await step.execute(createContext({}));

    assert.strictEqual(result.vars?.['log-x.message'], 'v=[{{vars.missing}}]');
  });
});
