import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOLogger } from '@pagopa/go-common/logging';

import { RunbookEngine } from '../RunbookEngine.js';
import type { ServiceRegistry } from '../../../toolkits/common/services/ServiceRegistry.js';
import type { KnownCase } from '../../types/KnownCase.js';
import type { Step } from '../../types/Step.js';
import type { StepResult } from '../../types/StepResult.js';
import { createTestServiceRegistry } from '../../../toolkits/common/testing/createTestServiceRegistry.js';
import { createTestRunbook } from '../../../__tests__/helpers/createTestRunbook.js';

/** A step that records its run and returns the given result. */
function recordingStep(id: string, executions: string[], result: StepResult<void> = { success: true }): Step<void> {
  return {
    id,
    label: id,
    kind: 'control',
    execute: async () => {
      await Promise.resolve();
      executions.push(id);
      return result;
    },
  };
}

const PLANNED_FAILURE: StepResult<void> = { success: false, error: 'planned failure' };

function createEngine(): RunbookEngine {
  return new RunbookEngine(new GOLogger());
}

describe('RunbookEngine status handling', () => {
  it('stops with failed status when a step returns success=false without continueOnFailure', async () => {
    const executions: string[] = [];
    const matchingCase: KnownCase = {
      id: 'would-match',
      description: 'Would match only if the runbook completed',
      priority: 10,
      condition: { type: 'compare', ref: 'params.mode', operator: '==', value: 'match' },
      action: { type: 'log', level: 'info', title: 'matched' },
    };

    const result = await createEngine().execute(
      createTestRunbook({
        steps: [
          { step: recordingStep('failing-step', executions, PLANNED_FAILURE) },
          { step: recordingStep('after-failure', executions) },
        ],
        knownCases: [matchingCase],
      }),
      new Map([['mode', 'match']]),
      createTestServiceRegistry(),
    );

    assert.strictEqual(result.status, 'failed');
    assert.strictEqual(result.trace.execution.status, 'failed');
    assert.strictEqual(result.trace.execution.failureReason, 'planned failure');
    assert.deepStrictEqual(executions, ['failing-step']);
    assert.deepStrictEqual(result.matchedCases, []);
    assert.strictEqual(result.stepsExecuted, 1);

    const failedTrace = result.trace.pipeline[0];
    assert.ok(failedTrace);
    assert.strictEqual(failedTrace.stepId, 'failing-step');
    assert.strictEqual(failedTrace.status, 'failed');
    assert.strictEqual(failedTrace.error, 'planned failure');

    const actionTrace = result.trace.actionsExecuted[0];
    assert.ok(actionTrace);
    assert.strictEqual(actionTrace.executed, false);
  });

  it("treats next: 'stop' as a normal completed execution", async () => {
    const executions: string[] = [];
    const result = await createEngine().execute(
      createTestRunbook({
        steps: [
          { step: recordingStep('stopper', executions, { success: true, next: 'stop' }) },
          { step: recordingStep('after-stop', executions) },
        ],
      }),
      new Map(),
      createTestServiceRegistry(),
    );

    assert.strictEqual(result.status, 'completed');
    assert.strictEqual(result.trace.execution.status, 'completed');
    assert.deepStrictEqual(executions, ['stopper']);
    assert.strictEqual(result.trace.summary.stepsExecuted, 1);

    const actionTrace = result.trace.actionsExecuted[0];
    assert.ok(actionTrace);
    assert.strictEqual(actionTrace.executed, true);
  });

  it('returns aborted when the caller aborts through AbortSignal', async () => {
    const executions: string[] = [];
    const controller = new AbortController();
    controller.abort();

    const result = await createEngine().execute(
      createTestRunbook({ steps: [{ step: recordingStep('never-runs', executions) }] }),
      new Map(),
      createTestServiceRegistry(),
      undefined,
      controller.signal,
    );

    assert.strictEqual(result.status, 'aborted');
    assert.strictEqual(result.trace.execution.status, 'aborted');
    assert.strictEqual(result.trace.execution.failureReason, 'Execution aborted by signal');
    assert.deepStrictEqual(executions, []);
    assert.strictEqual(result.stepsExecuted, 0);
    assert.deepStrictEqual(result.matchedCases, []);

    const actionTrace = result.trace.actionsExecuted[0];
    assert.ok(actionTrace);
    assert.strictEqual(actionTrace.executed, false);
  });

  it('executes only the primary action when multiple known cases match', async () => {
    const cases: ReadonlyArray<KnownCase> = [
      {
        id: 'secondary',
        description: 'Secondary case',
        priority: 10,
        condition: { type: 'compare', ref: 'params.mode', operator: '==', value: 'match' },
        action: { type: 'log', level: 'warn', title: 'secondary action' },
      },
      {
        id: 'primary',
        description: 'Primary case',
        priority: 20,
        condition: { type: 'compare', ref: 'params.mode', operator: '==', value: 'match' },
        action: { type: 'log', level: 'warn', title: 'primary action' },
      },
    ];

    const result = await createEngine().execute(
      createTestRunbook({ knownCases: cases }),
      new Map([['mode', 'match']]),
      createTestServiceRegistry(),
    );

    assert.deepStrictEqual(
      result.matchedCases.map((c) => c.id),
      ['primary', 'secondary'],
    );
    assert.deepStrictEqual(result.trace.caseMatching.matchedCaseIds, ['primary', 'secondary']);
    assert.strictEqual(result.trace.actionsExecuted.length, 1);

    const actionTrace = result.trace.actionsExecuted[0];
    assert.ok(actionTrace);
    assert.strictEqual(actionTrace.executed, true);
    assert.strictEqual(actionTrace.actionDetail.type, 'log');
    if (actionTrace.actionDetail.type === 'log') {
      assert.strictEqual(actionTrace.actionDetail.title, 'primary action');
    }
  });
});

describe('RunbookEngine narrative flushing', () => {
  /** A reporter whose flush fails the way a broken pipe or a full disk would. */
  function explodingReporter(): ServiceRegistry {
    return createTestServiceRegistry({
      reporter: {
        section: (): void => undefined,
        add: (): void => undefined,
        flush: (): never => {
          throw new Error('EPIPE: broken pipe');
        },
      },
    });
  }

  it('keeps a successful outcome when closing the narrative throws', async () => {
    const executions: string[] = [];

    const result = await createEngine().execute(
      createTestRunbook({ steps: [{ step: recordingStep('only-step', executions) }] }),
      new Map(),
      explodingReporter(),
    );

    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(executions, ['only-step']);
  });

  it('keeps the original failure instead of the logging error', async () => {
    const executions: string[] = [];

    const result = await createEngine().execute(
      createTestRunbook({ steps: [{ step: recordingStep('failing-step', executions, PLANNED_FAILURE) }] }),
      new Map(),
      explodingReporter(),
    );

    // Without the guard the finally block would surface `EPIPE: broken pipe`
    // and the real reason for the failure would be lost.
    assert.strictEqual(result.status, 'failed');
    assert.match(result.trace.execution.failureReason ?? '', /planned failure/u);
  });
});
