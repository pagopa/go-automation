import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOLogger } from '@pagopa/go-common/logging';

import { RunbookEngine } from '../RunbookEngine.js';
import { executeStep } from '../../steps/execution/executeStep.js';
import type { ServiceRegistry } from '../../../toolkits/common/services/ServiceRegistry.js';
import type { KnownCase } from '../../types/KnownCase.js';
import type { Step } from '../../types/Step.js';
import type { StepResult } from '../../types/StepResult.js';
import { createTestServiceRegistry } from '../../../toolkits/common/testing/createTestServiceRegistry.js';
import { createTestRunbook } from '../../../__tests__/helpers/createTestRunbook.js';
import { readEvidenceTime } from '../../../toolkits/common/parsing/aws/cloudwatch-logs/readEvidenceTime.js';

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
    assert.deepStrictEqual(result.detections, []);
    assert.deepStrictEqual(result.coverage, [
      { stepId: 'failing-step', complete: false, reason: 'unavailable', detail: 'planned failure' },
    ]);
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
    assert.deepStrictEqual(result.detections, []);

    const actionTrace = result.trace.actionsExecuted[0];
    assert.ok(actionTrace);
    assert.strictEqual(actionTrace.executed, false);
  });

  it('recovers a step with continueOnFailure whether it throws or returns its failure', async () => {
    const executions: string[] = [];
    const throwing: Step<void> = {
      id: 'throwing',
      label: 'throwing',
      kind: 'data',
      execute: async () => {
        await Promise.resolve();
        throw new Error('thrown failure');
      },
    };
    const result = await createEngine().execute(
      createTestRunbook({
        steps: [
          { step: throwing, continueOnFailure: true },
          { step: recordingStep('returning', executions, PLANNED_FAILURE), continueOnFailure: true },
          { step: recordingStep('after-failures', executions) },
        ],
      }),
      new Map(),
      createTestServiceRegistry(),
    );

    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(executions, ['returning', 'after-failures']);
    assert.deepStrictEqual(
      result.recoveredErrors.map(({ stepId, originalError }) => [stepId, originalError]),
      [
        ['throwing', 'thrown failure'],
        ['returning', 'planned failure'],
      ],
    );
    assert.deepStrictEqual(
      result.trace.pipeline.map(({ stepId, status, recovered }) => [stepId, status, recovered]),
      [
        ['throwing', 'failed', true],
        ['returning', 'failed', true],
        ['after-failures', 'success', false],
      ],
    );
  });

  it('ends aborted, without an unavailable read, when a step wrapped by executeStep is cancelled', async () => {
    const controller = new AbortController();
    const cancelled: Step<void> = {
      id: 'cancelled',
      label: 'cancelled',
      kind: 'data',
      execute: async (context) =>
        executeStep(context, 'Cancelled read', async () => {
          await Promise.resolve();
          controller.abort();
          throw new Error('read aborted');
        }),
    };
    const result = await createEngine().execute(
      createTestRunbook({ steps: [{ step: cancelled }] }),
      new Map(),
      createTestServiceRegistry(),
      undefined,
      controller.signal,
    );

    assert.strictEqual(result.status, 'aborted');
    assert.deepStrictEqual(result.coverage, []);
  });

  it('runs the action of every detection, in the order of the detections', async () => {
    const cases: ReadonlyArray<KnownCase> = [
      {
        id: 'first',
        description: 'First case',
        condition: { type: 'compare', ref: 'params.mode', operator: '==', value: 'match' },
        action: { type: 'log', level: 'warn', title: 'first action' },
      },
      {
        id: 'second',
        description: 'Second case',
        condition: { type: 'compare', ref: 'params.mode', operator: '==', value: 'match' },
        action: { type: 'log', level: 'warn', title: 'second action' },
      },
    ];

    const result = await createEngine().execute(
      createTestRunbook({ knownCases: cases }),
      new Map([['mode', 'match']]),
      createTestServiceRegistry(),
    );

    // Untimed detections keep the declaration order.
    assert.deepStrictEqual(
      result.detections.map((d) => d.knownCase.id),
      ['first', 'second'],
    );
    assert.deepStrictEqual(result.trace.caseMatching.matchedCaseIds, ['first', 'second']);
    assert.deepStrictEqual(
      result.trace.actionsExecuted.map((action) =>
        action.actionDetail.type === 'log' ? action.actionDetail.title : '',
      ),
      ['first action', 'second action'],
    );
  });
});

/** A row of a log query with its time. */
function row(at: string, message: string): ReadonlyArray<{ readonly field: string; readonly value: string }> {
  return [
    { field: '@timestamp', value: at },
    { field: '@message', value: message },
  ];
}

/** A step returning the given output. */
function outputStep(id: string, output: unknown, result: Partial<StepResult<unknown>> = {}): Step<unknown> {
  return {
    id,
    label: id,
    kind: 'data',
    execute: async () => Promise.resolve({ success: true, output, ...result }),
  };
}

function timedEngine(): RunbookEngine {
  return new RunbookEngine(new GOLogger(), { evidenceTime: readEvidenceTime });
}

function logCase(id: string, regex: string, extra: Partial<KnownCase> = {}): KnownCase {
  return {
    id,
    description: id,
    condition: { type: 'contains', ref: 'steps.logs', regex },
    action: { type: 'log', level: 'info', title: id },
    ...extra,
  };
}

describe('RunbookEngine detections', () => {
  it('orders the detections by the first time of their evidence, untimed last', async () => {
    const result = await timedEngine().execute(
      createTestRunbook({
        steps: [
          {
            step: outputStep('logs', [
              row('2026-11-19 10:05:00.000', 'ERROR late'),
              row('2026-11-19 10:01:00.000', 'ERROR early'),
              row('2026-11-19 10:07:00.000', 'ERROR late again'),
            ]),
          },
        ],
        knownCases: [
          {
            ...logCase('untimed', 'x'),
            condition: { type: 'compare', ref: 'params.mode', operator: '==', value: 'on' },
          },
          logCase('late', 'late'),
          logCase('early', 'early'),
        ],
      }),
      new Map([['mode', 'on']]),
      createTestServiceRegistry(),
    );

    assert.deepStrictEqual(
      result.detections.map((d) => d.knownCase.id),
      ['early', 'late', 'untimed'],
    );
    const late = result.detections[1];
    assert.strictEqual(late?.firstSeenAt, '2026-11-19T10:05:00.000Z');
    assert.strictEqual(late?.lastSeenAt, '2026-11-19T10:07:00.000Z');
    assert.strictEqual(late?.evidenceRows, 2);
    assert.strictEqual(result.detections[2]?.firstSeenAt, undefined);
  });

  it('collects the evidence of every matching row for a pattern, and none from a negation', async () => {
    const result = await timedEngine().execute(
      createTestRunbook({
        steps: [
          {
            step: outputStep('logs', [row('2026-11-19 10:09:00.000', 'boom'), row('2026-11-19 10:02:00.000', 'boom')]),
          },
        ],
        knownCases: [
          {
            ...logCase('boom', 'boom'),
            condition: {
              type: 'and',
              conditions: [
                { type: 'pattern', ref: 'steps.logs', regex: 'boom' },
                { type: 'not', condition: { type: 'pattern', ref: 'steps.logs', regex: 'absent' } },
              ],
            },
          },
        ],
      }),
      new Map(),
      createTestServiceRegistry(),
    );

    assert.strictEqual(result.detections[0]?.firstSeenAt, '2026-11-19T10:02:00.000Z');
    assert.strictEqual(result.detections[0]?.evidenceRows, 2);
  });

  it('takes the evidence of an or only from its satisfied branches', async () => {
    const result = await timedEngine().execute(
      createTestRunbook({
        steps: [
          { step: outputStep('logs', [row('2026-11-19 10:00:00.000', 'att'), row('2026-11-19 10:30:00.000', 'prod')]) },
        ],
        knownCases: [
          {
            ...logCase('env', 'x'),
            condition: {
              type: 'or',
              conditions: [
                {
                  type: 'and',
                  conditions: [
                    { type: 'compare', ref: 'params.env', operator: '==', value: 'att' },
                    { type: 'contains', ref: 'steps.logs', regex: 'att' },
                  ],
                },
                { type: 'contains', ref: 'steps.logs', regex: 'prod' },
              ],
            },
          },
        ],
      }),
      new Map([['env', 'prod']]),
      createTestServiceRegistry(),
    );

    assert.strictEqual(result.detections[0]?.firstSeenAt, '2026-11-19T10:30:00.000Z');
    assert.strictEqual(result.detections[0]?.evidenceRows, 1);
  });

  it('removes a superseded case from the detections and keeps it in the trace', async () => {
    const result = await timedEngine().execute(
      createTestRunbook({
        steps: [{ step: outputStep('logs', [row('2026-11-19 10:00:00.000', 'timeout of insert-trigger')]) }],
        knownCases: [
          logCase('generic-timeout', 'timeout'),
          logCase('specific-timeout', 'insert-trigger', { supersedes: ['generic-timeout'] }),
        ],
      }),
      new Map(),
      createTestServiceRegistry(),
    );

    assert.deepStrictEqual(
      result.detections.map((d) => d.knownCase.id),
      ['specific-timeout'],
    );
    const generic = result.trace.caseMatching.evaluations.find((e) => e.caseId === 'generic-timeout');
    assert.strictEqual(generic?.matched, true);
    assert.strictEqual(generic?.supersededBy, 'specific-timeout');
    assert.strictEqual(result.trace.actionsExecuted.length, 1);
  });

  it('keeps a superseded case read on a separate row, with the evidence the superseding case does not cover', async () => {
    const result = await timedEngine().execute(
      createTestRunbook({
        steps: [
          {
            step: outputStep('logs', [
              row('2026-11-19 10:00:00.000', 'timeout of insert-trigger'),
              row('2026-11-19 10:20:00.000', 'timeout of another lambda'),
            ]),
          },
        ],
        knownCases: [
          logCase('generic-timeout', 'timeout'),
          logCase('specific-timeout', 'insert-trigger', { supersedes: ['generic-timeout'] }),
        ],
      }),
      new Map(),
      createTestServiceRegistry(),
    );

    assert.deepStrictEqual(
      result.detections.map((d) => [d.knownCase.id, d.firstSeenAt, d.evidenceRows]),
      [
        ['specific-timeout', '2026-11-19T10:00:00.000Z', 1],
        ['generic-timeout', '2026-11-19T10:20:00.000Z', 1],
      ],
    );
  });

  it('replaces a case whose condition no longer holds without the rows the superseding case covers', async () => {
    const needsBoth: KnownCase = {
      ...logCase('timeout-then-recovery', 'x'),
      condition: {
        type: 'and',
        conditions: [
          { type: 'contains', ref: 'steps.logs', regex: 'timeout' },
          { type: 'contains', ref: 'steps.logs', regex: 'recovered' },
        ],
      },
    };
    const result = await timedEngine().execute(
      createTestRunbook({
        steps: [
          {
            step: outputStep('logs', [
              row('2026-11-19 10:00:00.000', 'timeout of insert-trigger'),
              row('2026-11-19 10:05:00.000', 'recovered'),
            ]),
          },
        ],
        knownCases: [
          needsBoth,
          logCase('specific-timeout', 'insert-trigger', { supersedes: ['timeout-then-recovery'] }),
        ],
      }),
      new Map(),
      createTestServiceRegistry(),
    );

    assert.deepStrictEqual(
      result.detections.map((d) => d.knownCase.id),
      ['specific-timeout'],
    );
  });

  it('replaces a case whose rows are covered together by two superseding cases', async () => {
    const result = await timedEngine().execute(
      createTestRunbook({
        steps: [
          {
            step: outputStep('logs', [
              row('2026-11-19 10:00:00.000', 'timeout of lambda-a'),
              row('2026-11-19 10:01:00.000', 'timeout of lambda-b'),
            ]),
          },
        ],
        knownCases: [
          logCase('generic-timeout', 'timeout'),
          logCase('timeout-a', 'lambda-a', { supersedes: ['generic-timeout'] }),
          logCase('timeout-b', 'lambda-b', { supersedes: ['generic-timeout'] }),
        ],
      }),
      new Map(),
      createTestServiceRegistry(),
    );

    assert.deepStrictEqual(
      result.detections.map((d) => d.knownCase.id),
      ['timeout-a', 'timeout-b'],
    );
  });

  it('treats steps.<id> and steps.<id>.output as the same rows when superseding', async () => {
    const result = await timedEngine().execute(
      createTestRunbook({
        steps: [
          {
            step: outputStep('logs', [
              row('2026-11-19 10:00:00.000', 'timeout of lambda-a'),
              row('2026-11-19 10:05:00.000', 'timeout of another lambda'),
            ]),
          },
        ],
        knownCases: [
          logCase('generic-timeout', 'timeout'),
          logCase('timeout-a', 'lambda-a', { supersedes: ['generic-timeout'] }),
          {
            ...logCase('timeout-a-again', 'x', { supersedes: ['generic-timeout'] }),
            condition: { type: 'contains', ref: 'steps.logs.output', regex: 'lambda-a' },
          },
        ],
      }),
      new Map(),
      createTestServiceRegistry(),
    );

    assert.ok(
      result.detections.some(
        (d) => d.knownCase.id === 'generic-timeout' && d.firstSeenAt === '2026-11-19T10:05:00.000Z',
      ),
    );
  });

  it('supersedes on a real output property of the step output, as references resolve it', async () => {
    const result = await timedEngine().execute(
      createTestRunbook({
        steps: [{ step: outputStep('logs', { output: [row('2026-11-19 10:00:00.000', 'timeout of lambda-a')] }) }],
        knownCases: [
          {
            ...logCase('generic-timeout', 'x'),
            condition: { type: 'contains', ref: 'steps.logs.output.output', regex: 'timeout' },
          },
          {
            ...logCase('timeout-a', 'x', { supersedes: ['generic-timeout'] }),
            condition: { type: 'contains', ref: 'steps.logs.output.output', regex: 'lambda-a' },
          },
        ],
      }),
      new Map(),
      createTestServiceRegistry(),
    );

    assert.deepStrictEqual(
      result.detections.map((d) => d.knownCase.id),
      ['timeout-a'],
    );
  });

  it('keeps a detection and declares the read unavailable when a later step fails', async () => {
    const executions: string[] = [];
    const result = await timedEngine().execute(
      createTestRunbook({
        steps: [
          { step: outputStep('logs', [row('2026-11-19 10:00:00.000', 'authorizer timeout')]) },
          { step: recordingStep('service-read', executions, { success: false, error: 'ThrottlingException' }) },
          { step: recordingStep('after', executions) },
        ],
        knownCases: [logCase('authorizer-timeout', 'authorizer timeout')],
        readPolicy: 'partial',
      }),
      new Map(),
      createTestServiceRegistry(),
    );

    assert.strictEqual(result.status, 'completed');
    assert.deepStrictEqual(executions, ['service-read']);
    assert.deepStrictEqual(
      result.detections.map((d) => d.knownCase.id),
      ['authorizer-timeout'],
    );
    assert.deepStrictEqual(result.coverage, [
      { stepId: 'service-read', complete: false, reason: 'unavailable', detail: 'ThrottlingException' },
    ]);
  });

  it('fails a procedure on a required step failure, even after a successful read', async () => {
    const executions: string[] = [];
    const base = createTestRunbook({
      steps: [
        { step: outputStep('logs', [row('2026-11-19 10:00:00.000', 'boom')]) },
        { step: recordingStep('write', executions, { success: false, error: 'write failed' }) },
      ],
    });
    const result = await timedEngine().execute(
      { ...base, metadata: { ...base.metadata, type: 'data-update' } },
      new Map(),
      createTestServiceRegistry(),
    );

    assert.strictEqual(result.status, 'failed');
    assert.strictEqual(result.trace.execution.failureReason, 'write failed');
  });

  it('reads with the policy the runbook declares, strictly without one', async () => {
    const policies: string[] = [];
    const probe: Step<void> = {
      id: 'probe',
      label: 'probe',
      kind: 'data',
      execute: async (context) => {
        policies.push(context.readPolicy ?? 'absent');
        return Promise.resolve({ success: true });
      },
    };
    const alarm = createTestRunbook({ steps: [{ step: probe }] });
    await timedEngine().execute({ ...alarm, readPolicy: 'partial' }, new Map(), createTestServiceRegistry());
    await timedEngine().execute(alarm, new Map(), createTestServiceRegistry());

    assert.deepStrictEqual(policies, ['partial', 'strict']);
  });

  it('ends aborted when the signal aborts while the cases are evaluated', async () => {
    const controller = new AbortController();
    const engine = new RunbookEngine(new GOLogger(), {
      evidenceTime: (element) => {
        controller.abort();
        return readEvidenceTime(element);
      },
    });
    const result = await engine.execute(
      createTestRunbook({
        steps: [{ step: outputStep('logs', [row('2026-11-19 10:00:00.000', 'boom')]) }],
        knownCases: [logCase('only', 'boom')],
      }),
      new Map(),
      createTestServiceRegistry(),
      undefined,
      controller.signal,
    );

    assert.strictEqual(result.status, 'aborted');
    assert.deepStrictEqual(result.detections, []);
  });

  it('ends aborted when the signal aborts while the actions of the detections run', async () => {
    const controller = new AbortController();
    const abortingCase = (id: string): KnownCase => ({
      id,
      description: id,
      condition: { type: 'compare', ref: 'params.mode', operator: '==', value: 'on' },
      action: {
        type: 'update',
        step: {
          id: `abort-${id}`,
          label: id,
          kind: 'control',
          execute: async () => {
            controller.abort();
            return Promise.resolve({ success: true });
          },
        },
      },
    });
    const result = await timedEngine().execute(
      createTestRunbook({ knownCases: [abortingCase('first'), abortingCase('second')] }),
      new Map([['mode', 'on']]),
      createTestServiceRegistry(),
      undefined,
      controller.signal,
    );

    assert.strictEqual(result.status, 'aborted');
    assert.deepStrictEqual(result.detections, []);
  });

  it('collects the coverage declared by the steps', async () => {
    const result = await timedEngine().execute(
      createTestRunbook({
        steps: [
          {
            step: outputStep('logs', [], {
              coverage: [
                { source: 'send/core', complete: false, reason: 'saturated' },
                { source: 'send/confinfo', complete: true },
              ],
            }),
          },
        ],
      }),
      new Map(),
      createTestServiceRegistry(),
    );

    assert.deepStrictEqual(result.coverage, [
      { stepId: 'logs', source: 'send/core', complete: false, reason: 'saturated' },
    ]);
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
