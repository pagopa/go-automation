import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookOutput } from '../RunbookOutput.js';
import type { RunbookResultField } from '../RunbookOutputContext.js';
import type { RunbookOutcome } from '../RunbookOutcome.js';
import { classifyRunbookOutcome } from '../classifyRunbookOutcome.js';
import type { CoverageEntry } from '../../../../engine/types/CoverageEntry.js';

const RETENTION_ERROR =
  "CloudWatch Logs StartQuery failed: [MalformedQueryException] Query's end date and time is either " +
  'before the log groups creation time or exceeds the log groups log retention settings ([0,146])';

function output(
  outcome: RunbookOutcome,
  options: {
    readonly recoveredErrors?: ReadonlyArray<{ readonly stepId: string; readonly error: string }>;
    readonly recordsScanned?: number;
    readonly recordsMatched?: number;
    readonly fields?: ReadonlyArray<RunbookResultField>;
    readonly incompleteSources?: number;
  } = {},
): RunbookOutput {
  const recordsScanned = options.recordsScanned ?? 0;
  const recordsMatched = options.recordsMatched ?? 0;

  return {
    schemaVersion: '2.0.0',
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
      recoveredErrors: options.recoveredErrors ?? [],
    },
    input: {},
    outcome,
    chains: [],
    coverage: {
      complete: (options.incompleteSources ?? 0) === 0,
      sources: incompleteSources(options.incompleteSources ?? 0),
    },
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
    context: { fields: options.fields ?? [], evidence: [] },
  };
}

function incompleteSources(count: number): ReadonlyArray<CoverageEntry> {
  return Array.from({ length: count }, (_unused, index) => ({
    stepId: `query-${String(index)}`,
    complete: false,
    reason: 'unavailable' as const,
  }));
}

describe('classifyRunbookOutcome', () => {
  it('classifies known cases, unknown cases and failures', () => {
    const hit = output(
      {
        kind: 'known-case-matched',
        detections: [{ caseId: 'lambda-timeout', description: 'Timeout', evidenceRows: 1, observations: [] }],
        message: 'm',
      },
      { recordsMatched: 1, recordsScanned: 10 },
    );
    const cases: ReadonlyArray<readonly [string, RunbookOutput, string]> = [
      ['a matched known case', hit, 'HIT'],
      [
        'an unknown case with matched records',
        output({ kind: 'unknown-case', casesEvaluated: 2, message: 'm' }, { recordsMatched: 5, recordsScanned: 100 }),
        'MISS',
      ],
      [
        'an unknown case with no matched records',
        output({ kind: 'unknown-case', casesEvaluated: 0, message: 'm' }),
        'NO-DATA',
      ],
      [
        'a ResourceNotFoundException failure',
        output({ kind: 'failed', error: 'ResourceNotFoundException: log group missing', message: 'm' }),
        'CONFIG-ERROR',
      ],
      ['a generic failure', output({ kind: 'failed', error: 'boom', message: 'm' }), 'EXECUTION-ERROR'],
      [
        'an inconclusive case',
        output({ kind: 'inconclusive', casesEvaluated: 2, message: 'm' }, { incompleteSources: 1 }),
        'INCONCLUSIVE',
      ],
    ];

    for (const [name, runbookOutput, status] of cases) {
      assert.strictEqual(classifyRunbookOutcome(runbookOutput).status, status, name);
    }
    assert.deepStrictEqual(classifyRunbookOutcome(hit).matchedCaseIds, ['lambda-timeout']);
    assert.deepStrictEqual(
      classifyRunbookOutcome(
        output({ kind: 'inconclusive', casesEvaluated: 2, message: 'm' }, { incompleteSources: 2 }),
      ).incompleteSources,
      { unavailable: 2 },
    );
  });

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

  it('carries the fallback fields on a MISS so the reason can be read later, and none on a HIT', () => {
    const fields = [{ name: 'apiGwErrorMessage', label: 'Error message API GW', value: 'Internal server error' }];
    const miss = classifyRunbookOutcome(
      output(
        { kind: 'unknown-case', casesEvaluated: 26, message: 'no match', fallbackMessage: 'Caso non riconosciuto' },
        { recordsScanned: 100, recordsMatched: 5, fields },
      ),
    );
    // A HIT without CloudWatch statistics reports no scan counters.
    const { telemetry: _withoutTelemetry, ...hitOutput } = output(
      {
        kind: 'known-case-matched',
        message: 'matched',
        detections: [{ caseId: 'c', description: 'd', evidenceRows: 1, observations: [] }],
      },
      { fields },
    );
    const hit = classifyRunbookOutcome(hitOutput);

    assert.strictEqual(miss.status, 'MISS');
    assert.deepStrictEqual(miss.fields, fields);
    assert.strictEqual(miss.fallbackMessage, 'Caso non riconosciuto');
    assert.strictEqual(hit.status, 'HIT');
    assert.deepStrictEqual(hit.matchedCaseIds, ['c']);
    assert.strictEqual(hit.fields, undefined);
    assert.strictEqual(hit.cloudWatchRecordsScanned, undefined);
  });
});
