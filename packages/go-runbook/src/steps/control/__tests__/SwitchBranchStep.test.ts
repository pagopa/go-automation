import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import type { Step } from '../../../types/Step.js';
import { createTestServiceRegistry } from '../../../registry/createTestServiceRegistry.js';
import { SetVarStep } from '../SetVarStep.js';
import { SwitchBranchStep } from '../SwitchBranchStep.js';

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

function setVarStep(id: string, varName: string, value: string): SetVarStep {
  return new SetVarStep({ id, label: id, varName, value });
}

function cases(): Map<string, ReadonlyArray<Step>> {
  return new Map<string, ReadonlyArray<Step>>([
    ['timeout', [setVarStep('set-retry', 'action', 'retry')]],
    ['not-found', [setVarStep('set-skip', 'action', 'skip')]],
  ]);
}

describe('SwitchBranchStep', () => {
  it('runs the pipeline of the matching case', async () => {
    const step = new SwitchBranchStep({ id: 'switch', label: 'Switch', ref: 'vars.errorType', cases: cases() });

    const result = await step.execute(createContext({ vars: { errorType: 'timeout' } }));

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.vars, { action: 'retry' });
  });

  it('falls back to the default pipeline when no case matches', async () => {
    const step = new SwitchBranchStep({
      id: 'switch',
      label: 'Switch',
      ref: 'vars.errorType',
      cases: cases(),
      defaultSteps: [setVarStep('set-escalate', 'action', 'escalate')],
    });

    assert.deepStrictEqual((await step.execute(createContext({ vars: { errorType: 'boom' } }))).vars, {
      action: 'escalate',
    });
  });

  it('falls back to the default pipeline when the reference does not resolve', async () => {
    const step = new SwitchBranchStep({
      id: 'switch',
      label: 'Switch',
      ref: 'vars.errorType',
      cases: cases(),
      defaultSteps: [setVarStep('set-escalate', 'action', 'escalate')],
    });

    assert.deepStrictEqual((await step.execute(createContext({}))).vars, { action: 'escalate' });
  });

  it('succeeds without vars when nothing matches and no default is declared', async () => {
    const step = new SwitchBranchStep({ id: 'switch', label: 'Switch', ref: 'vars.errorType', cases: cases() });

    const result = await step.execute(createContext({ vars: { errorType: 'boom' } }));

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars, undefined);
  });

  it('resolves params as well as vars', async () => {
    const step = new SwitchBranchStep({ id: 'switch', label: 'Switch', ref: 'params.errorType', cases: cases() });

    assert.deepStrictEqual((await step.execute(createContext({ params: { errorType: 'not-found' } }))).vars, {
      action: 'skip',
    });
  });

  it('treats a reference without a namespace as unresolved', async () => {
    const step = new SwitchBranchStep({
      id: 'switch',
      label: 'Switch',
      ref: 'errorType',
      cases: cases(),
      defaultSteps: [setVarStep('set-escalate', 'action', 'escalate')],
    });

    assert.deepStrictEqual((await step.execute(createContext({ vars: { errorType: 'timeout' } }))).vars, {
      action: 'escalate',
    });
  });

  it('leaves the parent context untouched: sub-steps write into a child copy', async () => {
    const context = createContext({ vars: { errorType: 'timeout' } });
    const step = new SwitchBranchStep({ id: 'switch', label: 'Switch', ref: 'vars.errorType', cases: cases() });

    await step.execute(context);

    assert.strictEqual(context.vars.has('action'), false);
  });
});
