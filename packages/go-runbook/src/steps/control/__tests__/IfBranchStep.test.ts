import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookContext } from '../../../types/RunbookContext.js';
import { createTestServiceRegistry } from '../../../services/createTestServiceRegistry.js';
import { SetVarStep } from '../SetVarStep.js';
import { IfBranchStep } from '../IfBranchStep.js';

function createContext(vars: Record<string, string> = {}): RunbookContext {
  return {
    executionId: 'test',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map<string, unknown>(),
    vars: new Map(Object.entries(vars)),
    params: new Map<string, string>(),
    logs: [],
    services: createTestServiceRegistry(),
    recoveredErrors: [],
  };
}

function setVarStep(id: string, varName: string, value: string): SetVarStep {
  return new SetVarStep({ id, label: id, varName, value });
}

const CONDITION = { type: 'compare', ref: 'vars.errorType', operator: '==', value: 'timeout' } as const;

describe('IfBranchStep', () => {
  it('runs the then-pipeline and returns the vars it produced', async () => {
    const step = new IfBranchStep({
      id: 'branch',
      label: 'Branch',
      condition: CONDITION,
      thenSteps: [setVarStep('set-retry', 'shouldRetry', 'true')],
      elseSteps: [setVarStep('set-skip', 'shouldRetry', 'false')],
    });

    const result = await step.execute(createContext({ errorType: 'timeout' }));

    assert.strictEqual(result.success, true);
    assert.deepStrictEqual(result.vars, { shouldRetry: 'true' });
  });

  it('runs the else-pipeline when the condition does not hold', async () => {
    const step = new IfBranchStep({
      id: 'branch',
      label: 'Branch',
      condition: CONDITION,
      thenSteps: [setVarStep('set-retry', 'shouldRetry', 'true')],
      elseSteps: [setVarStep('set-skip', 'shouldRetry', 'false')],
    });

    assert.deepStrictEqual((await step.execute(createContext({ errorType: 'not-found' }))).vars, {
      shouldRetry: 'false',
    });
  });

  it('succeeds without touching vars when the chosen branch is empty', async () => {
    const step = new IfBranchStep({ id: 'branch', label: 'Branch', condition: CONDITION, thenSteps: [] });

    const result = await step.execute(createContext({ errorType: 'timeout' }));

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars, undefined);
  });

  it('succeeds when the condition is false and no else-pipeline is declared', async () => {
    const step = new IfBranchStep({
      id: 'branch',
      label: 'Branch',
      condition: CONDITION,
      thenSteps: [setVarStep('set-retry', 'shouldRetry', 'true')],
    });

    const result = await step.execute(createContext({ errorType: 'not-found' }));

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.vars, undefined);
  });

  it('runs the sub-steps in order and accumulates every var', async () => {
    const step = new IfBranchStep({
      id: 'branch',
      label: 'Branch',
      condition: CONDITION,
      thenSteps: [setVarStep('a', 'first', '1'), setVarStep('b', 'second', '2'), setVarStep('c', 'first', '3')],
    });

    assert.deepStrictEqual((await step.execute(createContext({ errorType: 'timeout' }))).vars, {
      first: '3',
      second: '2',
    });
  });

  it('reports which sub-step failed', async () => {
    const failing = {
      id: 'boom',
      label: 'Boom',
      kind: 'control' as const,
      execute: async (): Promise<{ readonly success: false; readonly error: string }> => {
        await Promise.resolve();
        return { success: false, error: 'downstream unavailable' };
      },
    };
    const step = new IfBranchStep({ id: 'branch', label: 'Branch', condition: CONDITION, thenSteps: [failing] });

    const result = await step.execute(createContext({ errorType: 'timeout' }));

    assert.strictEqual(result.success, false);
    assert.match(result.error ?? '', /Sub-step 'boom' failed: downstream unavailable/u);
  });

  it('leaves the parent context untouched: sub-steps write into a child copy', async () => {
    const context = createContext({ errorType: 'timeout' });
    const step = new IfBranchStep({
      id: 'branch',
      label: 'Branch',
      condition: CONDITION,
      thenSteps: [setVarStep('set-retry', 'shouldRetry', 'true')],
    });

    await step.execute(context);

    assert.strictEqual(context.vars.has('shouldRetry'), false);
  });
});
