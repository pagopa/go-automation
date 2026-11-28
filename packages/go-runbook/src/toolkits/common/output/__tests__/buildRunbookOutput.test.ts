import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { CaseAction } from '../../../../engine/types/CaseAction.js';
import type { KnownError } from '../../../../engine/types/KnownError.js';
import type { Runbook } from '../../../../engine/types/Runbook.js';
import type { RunbookExecutionResult } from '../../../../engine/types/RunbookExecutionResult.js';
import type { RunbookExecutionStatus } from '../../../../engine/types/RunbookExecutionStatus.js';
import type { RunbookType } from '../../../../engine/types/RunbookType.js';
import type { StepTrace } from '../../../../engine/tracing/StepTrace.js';
import { buildRunbookOutput } from '../buildRunbookOutput.js';
import { createTestExecutionResult } from '../../../../__tests__/helpers/createTestExecutionResult.js';
import { createTestRunbook } from '../../../../__tests__/helpers/createTestRunbook.js';

const FALLBACK_ACTION: CaseAction = { type: 'log', level: 'warn', title: 'fallback {{vars.reason}}' };

function createRunbook(args: {
  readonly type?: RunbookType;
  readonly knownErrors?: ReadonlyArray<KnownError>;
}): Runbook {
  return createTestRunbook({
    metadata: { ...createTestRunbook().metadata, type: args.type ?? 'alarm-resolution' },
    knownErrors: args.knownErrors ?? [],
    fallbackAction: FALLBACK_ACTION,
  });
}

function createResult(args: {
  readonly status?: RunbookExecutionStatus;
  readonly matchedCases?: ReadonlyArray<KnownError>;
  readonly vars?: Readonly<Record<string, string>>;
  readonly pipeline?: ReadonlyArray<StepTrace>;
}): RunbookExecutionResult {
  const status = args.status ?? 'completed';
  const matchedCases = args.matchedCases ?? [];
  const result = createTestExecutionResult({
    status,
    matchedCases,
    vars: args.vars ?? { reason: 'no-match' },
    params: { alarmName: 'test-alarm' },
    recoveredErrors: [
      {
        stepId: 'recoverable',
        originalError: 'temporary error',
        failedAt: new Date('2026-01-01T00:00:01.000Z'),
      },
    ],
  });
  return {
    ...result,
    trace: {
      ...result.trace,
      execution: { ...result.trace.execution, ...(status !== 'completed' ? { failureReason: 'boom' } : {}) },
      pipeline: args.pipeline ?? [],
      caseMatching: { ...result.trace.caseMatching, casesEvaluated: 2 },
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
      summary: { ...result.trace.summary, outcome: 'summary outcome' },
    },
  };
}

function knownError(): KnownError {
  return {
    code: 'known',
    description: 'Known error',
    condition: { type: 'compare', ref: 'vars.reason', operator: '==', value: 'known' },
    action: { type: 'log', level: 'info', title: 'known {{vars.reason}}' },
  };
}

describe('buildRunbookOutput', () => {
  it('maps matched cases to known-error-matched and includes traceFile', () => {
    const matched = knownError();
    const output = buildRunbookOutput(
      createRunbook({ knownErrors: [matched] }),
      createResult({ matchedCases: [matched] }),
      {
        traceFile: 'trace-test.json',
      },
    );

    assert.strictEqual(output.schemaVersion, '5.0.0');
    assert.strictEqual(output.outcome.kind, 'known-error-matched');
    assert.strictEqual(output.execution.traceFile, 'trace-test.json');
    assert.strictEqual(output.execution.recoveredErrors[0]?.error, 'temporary error');
    if (output.outcome.kind === 'known-error-matched') {
      assert.strictEqual(output.outcome.detections[0]?.code, 'known');
      assert.strictEqual(output.outcome.detections[0]?.resolvedMessage, 'resolved action');
      assert.strictEqual(output.outcome.detections[0]?.analysisType, undefined, 'no analysis, no type');
    }
  });

  it('carries the analysis type of each detected known error', () => {
    const ignorable: KnownError = {
      ...knownError(),
      analysis: {
        resolution: 'Nessuna azione',
        proposedStatus: 'COMPLETED',
        analysisType: 'IGNORABLE',
        ignoreReasonCode: 'X',
      },
    };
    const output = buildRunbookOutput(
      createRunbook({ knownErrors: [ignorable] }),
      createResult({ matchedCases: [ignorable] }),
    );
    assert.ok(output.outcome.kind === 'known-error-matched');
    assert.strictEqual(output.outcome.detections[0]?.analysisType, 'IGNORABLE');
  });

  it('maps completed alarm-resolution without matches to unknown-error with interpolated fallback', () => {
    const output = buildRunbookOutput(createRunbook({}), createResult({}));

    assert.strictEqual(output.outcome.kind, 'unknown-error');
    if (output.outcome.kind === 'unknown-error') {
      assert.strictEqual(output.outcome.casesEvaluated, 2);
      assert.strictEqual(output.outcome.fallbackMessage, 'fallback no-match');
    }
  });

  it('gives failed executions precedence over unknown-error', () => {
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
        vars: {
          procedureOutcome: 'failure',
          procedureMessage: 'procedure failed',
          'procedureMetric.failedItems': '2',
        },
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

  it('aggregates CloudWatch Logs query statistics into telemetry', () => {
    const queryStep: StepTrace = {
      executionOrder: 1,
      stepId: 'query-api-gw-logs',
      label: 'Query API Gateway',
      kind: 'data',
      reachedVia: 'sequential',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      durationMs: 1000,
      status: 'success',
      recovered: false,
      input: {},
      output: [],
      varsWritten: {},
      diagnostics: {
        cloudWatchLogs: {
          rowsReturned: 2,
          statistics: { bytesScanned: 1000, recordsScanned: 100, recordsMatched: 2 },
          queryExecutions: [
            {
              queryId: 'qid-1',
              profile: 'profile-1',
              logGroups: ['/aws/apigw/access'],
              statistics: { bytesScanned: 1000, recordsScanned: 100, recordsMatched: 2 },
            },
          ],
        },
      },
      flowDirective: 'continue',
    };
    const serviceStep: StepTrace = {
      ...queryStep,
      executionOrder: 2,
      stepId: 'query-service',
      label: 'Query service',
      diagnostics: {
        cloudWatchLogs: {
          rowsReturned: 1,
          statistics: { bytesScanned: 500, recordsScanned: 50, recordsMatched: 1 },
          queryExecutions: [
            {
              queryId: 'qid-2',
              profile: 'profile-2',
              logGroups: ['/aws/ecs/service'],
              statistics: { bytesScanned: 500, recordsScanned: 50, recordsMatched: 1 },
            },
          ],
        },
      },
    };

    const output = buildRunbookOutput(createRunbook({}), createResult({ pipeline: [queryStep, serviceStep] }));

    assert.strictEqual(output.telemetry?.cloudWatchLogs?.queryCount, 2);
    assert.strictEqual(output.telemetry?.cloudWatchLogs?.statistics.bytesScanned, 1500);
    assert.strictEqual(output.telemetry?.cloudWatchLogs?.statistics.recordsScanned, 150);
    assert.deepStrictEqual(
      output.telemetry?.cloudWatchLogs?.queryExecutions.map((execution) => execution.queryId),
      ['qid-1', 'qid-2'],
    );
  });
});
