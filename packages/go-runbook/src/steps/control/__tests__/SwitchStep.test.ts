import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../services/createTestServiceRegistry.js';
import { SwitchStep } from '../SwitchStep.js';

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

describe('SwitchStep', () => {
  const base = {
    id: 'switch-status',
    label: 'Route by status',
    ref: 'vars.status',
    cases: { '404': 'handle-not-found', '500': 'handle-server-error' },
  } as const;

  it('jumps to the branch matching the resolved value', async () => {
    const result = await new SwitchStep(base).execute(createContext({ vars: { status: '404' } }));

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.next, { goTo: 'handle-not-found' });
  });

  it('falls back to defaultGoTo when no case matches', async () => {
    const step = new SwitchStep({ ...base, defaultGoTo: 'handle-unknown' });

    assert.deepStrictEqual((await step.execute(createContext({ vars: { status: '418' } }))).next, {
      goTo: 'handle-unknown',
    });
  });

  it('falls back to defaultGoTo when the reference does not resolve', async () => {
    const step = new SwitchStep({ ...base, defaultGoTo: 'handle-unknown' });

    assert.deepStrictEqual((await step.execute(createContext({}))).next, { goTo: 'handle-unknown' });
  });

  it('continues when nothing matches and no default is declared', async () => {
    assert.strictEqual(
      (await new SwitchStep(base).execute(createContext({ vars: { status: '418' } }))).next,
      'continue',
    );
  });
});
