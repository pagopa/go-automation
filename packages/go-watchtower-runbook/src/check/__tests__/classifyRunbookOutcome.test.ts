import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookOutcome, RunbookOutput } from '@go-automation/go-runbook';

import { classifyRunbookOutcome } from '@go-automation/go-runbook';

interface MakeOptions {
  readonly recordsMatched?: number;
  readonly recordsScanned?: number;
  readonly recoveredErrors?: ReadonlyArray<{ readonly stepId: string; readonly error: string }>;
}

function makeOutput(outcome: RunbookOutcome, options: MakeOptions = {}): RunbookOutput {
  return {
    schemaVersion: '1.0.0',
    generatedAt: '2026-01-01T00:00:00.000Z',
    runbook: { id: 'r', name: 'r', type: 'alarm-resolution', version: '1.0.0', team: 'GO' },
    execution: {
      executionId: 'e',
      startedAt: '2026-01-01T00:00:00.000Z',
      completedAt: '2026-01-01T00:00:01.000Z',
      durationMs: 1000,
      status: 'completed',
      stepsExecuted: 1,
      earlyResolution: false,
      recoveredErrors: options.recoveredErrors ?? [],
    },
    input: {},
    outcome,
    telemetry: {
      cloudWatchLogs: {
        queryCount: 1,
        statistics: {
          bytesScanned: 0,
          recordsScanned: options.recordsScanned ?? 0,
          recordsMatched: options.recordsMatched ?? 0,
        },
        queryExecutions: [],
      },
    },
    context: { fields: [], evidence: [] },
  };
}

describe('classifyRunbookOutcome', () => {
  it('HIT on a matched known case', () => {
    const check = classifyRunbookOutcome(
      makeOutput(
        {
          kind: 'known-case-matched',
          primaryCaseId: 'lambda-timeout',
          primaryCaseDescription: 'Timeout',
          matchedCases: [{ id: 'lambda-timeout', description: 'Timeout', priority: 100 }],
          message: 'm',
        },
        { recordsMatched: 1, recordsScanned: 10 },
      ),
    );
    assert.strictEqual(check.status, 'HIT');
    assert.strictEqual(check.primaryCaseId, 'lambda-timeout');
  });

  it('MISS on unknown-case with matched records', () => {
    const check = classifyRunbookOutcome(
      makeOutput({ kind: 'unknown-case', casesEvaluated: 2, message: 'm' }, { recordsMatched: 5, recordsScanned: 100 }),
    );
    assert.strictEqual(check.status, 'MISS');
  });

  it('NO-DATA on unknown-case with zero matched records', () => {
    const check = classifyRunbookOutcome(
      makeOutput({ kind: 'unknown-case', casesEvaluated: 0, message: 'm' }, { recordsMatched: 0, recordsScanned: 0 }),
    );
    assert.strictEqual(check.status, 'NO-DATA');
  });

  it('CONFIG-ERROR on a ResourceNotFoundException failure', () => {
    const check = classifyRunbookOutcome(
      makeOutput({ kind: 'failed', error: 'ResourceNotFoundException: log group missing', message: 'm' }),
    );
    assert.strictEqual(check.status, 'CONFIG-ERROR');
  });

  it('EXECUTION-ERROR on a generic failure', () => {
    const check = classifyRunbookOutcome(makeOutput({ kind: 'failed', error: 'boom', message: 'm' }));
    assert.strictEqual(check.status, 'EXECUTION-ERROR');
  });
});
