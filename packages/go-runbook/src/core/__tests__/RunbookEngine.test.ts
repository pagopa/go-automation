import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOLogger } from '@go-automation/go-common/core';

import { RunbookEngine } from '../RunbookEngine.js';
import { ConditionEvaluator } from '../ConditionEvaluator.js';
import type { CaseAction } from '../../actions/CaseAction.js';
import type { ServiceRegistry } from '../../services/ServiceRegistry.js';
import type { FlowDirective } from '../../types/FlowDirective.js';
import type { KnownCase } from '../../types/KnownCase.js';
import type { Runbook } from '../../types/Runbook.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { Step } from '../../types/Step.js';
import type { StepDescriptor } from '../../types/StepDescriptor.js';
import type { StepKind } from '../../types/StepKind.js';
import type { StepResult } from '../../types/StepResult.js';

class RecordingStep implements Step<void> {
  readonly label: string;
  readonly kind: StepKind = 'control';

  constructor(
    readonly id: string,
    private readonly executions: string[],
    private readonly directive?: FlowDirective,
  ) {
    this.label = `Step ${id}`;
  }

  async execute(_context: RunbookContext): Promise<StepResult<void>> {
    await Promise.resolve();
    this.executions.push(this.id);
    if (this.directive === undefined) {
      return { success: true };
    }
    return { success: true, next: this.directive };
  }
}

class ReturnedFailureStep implements Step<void> {
  readonly label: string;
  readonly kind: StepKind = 'data';

  constructor(
    readonly id: string,
    private readonly executions: string[],
    private readonly error: string,
  ) {
    this.label = `Step ${id}`;
  }

  async execute(_context: RunbookContext): Promise<StepResult<void>> {
    await Promise.resolve();
    this.executions.push(this.id);
    return { success: false, error: this.error };
  }
}

function createEngine(): RunbookEngine {
  return new RunbookEngine(new GOLogger(), new ConditionEvaluator());
}

function emptyServices(): ServiceRegistry {
  return {} as unknown as ServiceRegistry;
}

function createRunbook(steps: ReadonlyArray<StepDescriptor>, knownCases: ReadonlyArray<KnownCase> = []): Runbook {
  const fallbackAction: CaseAction = { type: 'log', level: 'warn', message: 'fallback' };
  return {
    metadata: {
      id: 'test-runbook',
      name: 'Test Runbook',
      description: 'desc',
      version: '1.0.0',
      type: 'alarm-resolution',
      team: 'GO',
      tags: [],
    },
    steps,
    knownCases,
    fallbackAction,
  };
}

describe('RunbookEngine status handling', () => {
  it('stops with failed status when a step returns success=false without continueOnFailure', async () => {
    const executions: string[] = [];
    const matchingCase: KnownCase = {
      id: 'would-match',
      description: 'Would match only if the runbook completed',
      priority: 10,
      condition: { type: 'compare', ref: 'params.mode', operator: '==', value: 'match' },
      action: { type: 'log', level: 'info', message: 'matched' },
    };

    const result = await createEngine().execute(
      createRunbook(
        [
          { step: new ReturnedFailureStep('failing-step', executions, 'planned failure') },
          { step: new RecordingStep('after-failure', executions) },
        ],
        [matchingCase],
      ),
      new Map([['mode', 'match']]),
      emptyServices(),
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
      createRunbook([
        { step: new RecordingStep('stopper', executions, 'stop') },
        { step: new RecordingStep('after-stop', executions) },
      ]),
      new Map(),
      emptyServices(),
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
      createRunbook([{ step: new RecordingStep('never-runs', executions) }]),
      new Map(),
      emptyServices(),
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
        action: { type: 'log', level: 'warn', message: 'secondary action' },
      },
      {
        id: 'primary',
        description: 'Primary case',
        priority: 20,
        condition: { type: 'compare', ref: 'params.mode', operator: '==', value: 'match' },
        action: { type: 'log', level: 'warn', message: 'primary action' },
      },
    ];

    const result = await createEngine().execute(
      createRunbook([], cases),
      new Map([['mode', 'match']]),
      emptyServices(),
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
      assert.strictEqual(actionTrace.actionDetail.message, 'primary action');
    }
  });
});
