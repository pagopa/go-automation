import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../registry/createTestServiceRegistry.js';
import { IfStep } from '../IfStep.js';

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

describe('IfStep', () => {
  const condition = { type: 'exists', ref: 'vars.traceId' } as const;

  it('jumps to thenGoTo when the condition holds', async () => {
    const step = new IfStep({ id: 'if-trace', label: 'Has trace', condition, thenGoTo: 'query-service' });

    const result = await step.execute(createContext({ vars: { traceId: '1-abc' } }));

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.next, { goTo: 'query-service' });
  });

  it('jumps to elseGoTo when the condition does not hold', async () => {
    const step = new IfStep({ id: 'if-trace', label: 'Has trace', condition, elseGoTo: 'stop-analysis' });

    assert.deepStrictEqual((await step.execute(createContext({}))).next, { goTo: 'stop-analysis' });
  });

  it('continues when the matching branch declares no target', async () => {
    const step = new IfStep({ id: 'if-trace', label: 'Has trace', condition, elseGoTo: 'stop-analysis' });

    assert.strictEqual((await step.execute(createContext({ vars: { traceId: '1-abc' } }))).next, 'continue');
  });

  it('never fails: the step only routes, it does not assert', async () => {
    const step = new IfStep({ id: 'if-trace', label: 'Has trace', condition });

    assert.strictEqual((await step.execute(createContext({}))).success, true);
  });
});
