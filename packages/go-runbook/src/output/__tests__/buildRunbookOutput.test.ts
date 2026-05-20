import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { CaseAction } from '../../actions/CaseAction.js';
import type { KnownCase } from '../../types/KnownCase.js';
import type { Runbook } from '../../types/Runbook.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { RunbookExecutionResult } from '../../types/RunbookExecutionResult.js';
import type { RunbookExecutionStatus } from '../../types/RunbookExecutionStatus.js';
import type { RunbookType } from '../../types/RunbookType.js';
import type { RunbookExecutionTrace } from '../../trace/RunbookExecutionTrace.js';
import type { StepTrace } from '../../trace/StepTrace.js';
import type { ServiceRegistry } from '../../services/ServiceRegistry.js';
import { buildRunbookOutput } from '../buildRunbookOutput.js';

const FALLBACK_ACTION: CaseAction = { type: 'log', level: 'warn', message: 'fallback {{vars.reason}}' };

function createRunbook(args: { readonly type?: RunbookType; readonly knownCases?: ReadonlyArray<KnownCase> }): Runbook {
  return {
    metadata: {
      id: 'test-runbook',
      name: 'Test Runbook',
      description: 'desc',
      version: '1.0.0',
      type: args.type ?? 'alarm-resolution',
      team: 'GO',
      tags: [],
    },
    steps: [],
    knownCases: args.knownCases ?? [],
    fallbackAction: FALLBACK_ACTION,
  };
}

function createResult(args: {
  readonly status?: RunbookExecutionStatus;
  readonly runbookType?: RunbookType;
  readonly matchedCases?: ReadonlyArray<KnownCase>;
  readonly vars?: ReadonlyMap<string, string>;
  readonly pipeline?: ReadonlyArray<StepTrace>;
}): RunbookExecutionResult {
  const status = args.status ?? 'completed';
  const vars = args.vars ?? new Map<string, string>([['reason', 'no-match']]);
  const params = new Map<string, string>([['alarmName', 'test-alarm']]);
  const finalContext: RunbookContext = {
    executionId: 'exec-1',
    startedAt: new Date('2026-01-01T00:00:00.000Z'),
    stepResults: new Map(),
    vars,
    params,
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [
      {
        stepId: 'recoverable',
        originalError: 'temporary error',
        failedAt: new Date('2026-01-01T00:00:01.000Z'),
        skipped: true,
      },
    ],
  };
  const matchedCases = args.matchedCases ?? [];
  const trace: RunbookExecutionTrace = {
    schemaVersion: '1.0.0',
    execution: {
      executionId: 'exec-1',
      runbookId: 'test-runbook',
      runbookName: 'Test Runbook',
      runbookVersion: '1.0.0',
      runbookType: args.runbookType ?? 'alarm-resolution',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:05.000Z',
      durationMs: 5000,
      status,
      environment: { awsProfiles: [], region: 'eu-south-1', invokedBy: 'manual' },
      ...(status !== 'completed' ? { failureReason: 'boom' } : {}),
    },
    input: { alarmName: 'test-alarm' },
    pipeline: args.pipeline ?? [],
    variables: Object.fromEntries(vars),
    caseMatching: {
      casesEvaluated: 2,
      evaluations: [],
      matchedCaseIds: matchedCases.map((knownCase) => knownCase.id),
    },
    actionsExecuted: [
      {
        executed: true,
        actionType: 'log',
        actionDetail: matchedCases[0]?.action ?? FALLBACK_ACTION,
        resolvedMessage: 'resolved action',
        status: 'success',
        durationMs: 1,
      },
    ],
    summary: {
      description: status === 'completed' ? 'completed' : 'failed',
      totalSteps: 1,
      stepsExecuted: 1,
      stepsFailed: status === 'failed' ? 1 : 0,
      stepsRecovered: 0,
      stepsSkipped: 0,
      outcome: 'summary outcome',
    },
  };

  return {
    runbookId: 'test-runbook',
    status,
    matchedCases,
    durationMs: 5000,
    stepsExecuted: 1,
    finalContext,
    recoveredErrors: finalContext.recoveredErrors,
    trace,
  };
}

function knownCase(): KnownCase {
  return {
    id: 'known',
    description: 'Known case',
    priority: 10,
    condition: { type: 'compare', ref: 'vars.reason', operator: '==', value: 'known' },
    action: { type: 'log', level: 'info', message: 'known {{vars.reason}}' },
  };
}

describe('buildRunbookOutput', () => {
  it('maps matched cases to known-case-matched and includes traceFile', () => {
    const matched = knownCase();
    const output = buildRunbookOutput(
      createRunbook({ knownCases: [matched] }),
      createResult({ matchedCases: [matched] }),
      {
        traceFile: 'trace-test.json',
      },
    );

    assert.strictEqual(output.outcome.kind, 'known-case-matched');
    assert.strictEqual(output.execution.traceFile, 'trace-test.json');
    assert.strictEqual(output.execution.recoveredErrors[0]?.error, 'temporary error');
    if (output.outcome.kind === 'known-case-matched') {
      assert.strictEqual(output.outcome.primaryCaseId, 'known');
      assert.strictEqual(output.outcome.matchedCases[0]?.resolvedMessage, 'resolved action');
    }
  });

  it('maps completed alarm-resolution without matches to unknown-case with interpolated fallback', () => {
    const output = buildRunbookOutput(createRunbook({}), createResult({}));

    assert.strictEqual(output.outcome.kind, 'unknown-case');
    if (output.outcome.kind === 'unknown-case') {
      assert.strictEqual(output.outcome.casesEvaluated, 2);
      assert.strictEqual(output.outcome.fallbackMessage, 'fallback no-match');
    }
  });

  it('gives failed executions precedence over unknown-case', () => {
    const failedStep: StepTrace = {
      executionOrder: 1,
      stepId: 'query',
      label: 'Query',
      kind: 'data',
      reachedVia: 'sequential',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      durationMs: 1000,
      status: 'failed',
      recovered: false,
      input: {},
      output: undefined,
      error: 'query failed',
      varsWritten: {},
      flowDirective: 'continue',
    };

    const output = buildRunbookOutput(createRunbook({}), createResult({ status: 'failed', pipeline: [failedStep] }));

    assert.strictEqual(output.outcome.kind, 'failed');
    if (output.outcome.kind === 'failed') {
      assert.strictEqual(output.outcome.failedStepId, 'query');
      assert.strictEqual(output.outcome.error, 'query failed');
    }
  });

  it('maps procedure failure from vars and invokes the context builder', () => {
    const context = { fields: [{ name: 'target', label: 'Target', value: 'demo' }], evidence: [] };
    const output = buildRunbookOutput(
      createRunbook({ type: 'data-update' }),
      createResult({
        runbookType: 'data-update',
        vars: new Map<string, string>([
          ['procedureOutcome', 'failure'],
          ['procedureMessage', 'procedure failed'],
          ['procedureMetric.failedItems', '2'],
        ]),
      }),
      { contextBuilder: () => context },
    );

    assert.strictEqual(output.outcome.kind, 'procedure-failure');
    assert.deepStrictEqual(output.context, context);
    if (output.outcome.kind === 'procedure-failure') {
      assert.strictEqual(output.outcome.summary, 'procedure failed');
      assert.strictEqual(output.outcome.metrics?.['failedItems'], 2);
    }
  });
});
