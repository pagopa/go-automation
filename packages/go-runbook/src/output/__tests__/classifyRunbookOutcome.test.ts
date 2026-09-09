import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookOutput } from '../RunbookOutput.js';
import type { RunbookOutcome } from '../RunbookOutcome.js';
import { classifyRunbookOutcome } from '../classifyRunbookOutcome.js';

const RETENTION_ERROR =
  "CloudWatch Logs StartQuery failed: [MalformedQueryException] Query's end date and time is either " +
  'before the log groups creation time or exceeds the log groups log retention settings ([0,146])';

function output(
  outcome: RunbookOutcome,
  options: {
    readonly recoveredErrors?: ReadonlyArray<{ readonly stepId: string; readonly error: string }>;
    readonly recordsScanned?: number;
    readonly recordsMatched?: number;
  } = {},
): RunbookOutput {
  const recordsScanned = options.recordsScanned ?? 0;
  const recordsMatched = options.recordsMatched ?? 0;

  return {
    schemaVersion: '1.0.0',
    generatedAt: '2026-09-01T10:00:00.000Z',
    runbook: {
      id: 'test-runbook',
      name: 'Test Runbook',
      type: 'alarm-resolution',
      version: '1.0.0',
      team: 'GO',
    },
    execution: {
      executionId: 'execution-1',
      startedAt: '2026-09-01T10:00:00.000Z',
      completedAt: '2026-09-01T10:00:01.000Z',
      durationMs: 1000,
      status: outcome.kind === 'failed' ? 'failed' : 'completed',
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
          bytesScanned: 1,
          recordsScanned,
          recordsMatched,
        },
        queryExecutions: [],
      },
    },
    context: { fields: [], evidence: [] },
  };
}

describe('classifyRunbookOutcome', () => {
  it('classifies a fatal query outside log retention as NO-DATA', () => {
    const result = classifyRunbookOutcome(
      output({
        kind: 'failed',
        failedStepId: 'query-api-gw-logs',
        error: RETENTION_ERROR,
        message: 'Runbook failed',
      }),
    );

    assert.strictEqual(result.status, 'NO-DATA');
    assert.match(result.error ?? '', /retention settings/);
  });

  it('keeps a malformed Logs Insights query as CONFIG-ERROR', () => {
    const result = classifyRunbookOutcome(
      output({
        kind: 'failed',
        failedStepId: 'query-api-gw-logs',
        error: 'MalformedQueryException: unexpected symbol near line 2',
        message: 'Runbook failed',
      }),
    );

    assert.strictEqual(result.status, 'CONFIG-ERROR');
  });

  it('does not turn a recoverable retention failure into CONFIG-ERROR when other logs were scanned', () => {
    const result = classifyRunbookOutcome(
      output(
        { kind: 'unknown-case', casesEvaluated: 1, message: 'No known case' },
        {
          recoveredErrors: [{ stepId: 'optional-query', error: RETENTION_ERROR }],
          recordsScanned: 10,
          recordsMatched: 1,
        },
      ),
    );

    assert.strictEqual(result.status, 'MISS');
  });
});
