import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { Runbook } from '../../types/Runbook.js';
import type { RunbookContext } from '../../types/RunbookContext.js';
import type { ServiceRegistry } from '../../services/ServiceRegistry.js';
import type { ExecutionEnvironment } from '../ExecutionInfo.js';
import type { CaseEvaluationTrace } from '../CaseEvaluationTrace.js';
import { TraceBuilder } from '../TraceBuilder.js';

const RUNBOOK: Runbook = {
  metadata: {
    id: 'tb-test',
    name: 'Trace builder test',
    description: '',
    version: '1.0.0',
    type: 'alarm-resolution',
    team: 'GO',
    tags: [],
  },
  steps: [],
  knownCases: [],
  fallbackAction: { type: 'log', level: 'warn', message: 'fallback' },
};

const ENV: ExecutionEnvironment = {
  awsProfiles: [],
  region: 'eu-south-1',
  invokedBy: 'manual',
};

function emptyContext(): RunbookContext {
  return {
    executionId: 'exec',
    startedAt: new Date('2026-05-13T00:00:00.000Z'),
    stepResults: new Map(),
    vars: new Map(),
    params: new Map(),
    logs: [],
    services: {} as unknown as ServiceRegistry,
    recoveredErrors: [],
  };
}

/** Helper: a TraceBuilder primed with a single step (so traceEarlyResolution can attach to it). */
function builderWithOneStep(): TraceBuilder {
  return new TraceBuilder('exec', RUNBOOK, new Map()).traceStep(
    'analyze-x',
    'Analyze x',
    'transform',
    'sequential',
    '2026-05-13T00:00:00.000Z',
    '2026-05-13T00:00:00.001Z',
    1,
    'success',
    false,
    {},
    null,
    {},
    'resolve',
  );
}

describe('TraceBuilder', () => {
  it('stores step diagnostics in the pipeline trace', () => {
    const trace = new TraceBuilder('exec', RUNBOOK, new Map())
      .traceStep(
        'query-logs',
        'Query logs',
        'data',
        'sequential',
        '2026-05-13T00:00:00.000Z',
        '2026-05-13T00:00:00.001Z',
        1,
        'success',
        false,
        {},
        [],
        {},
        'continue',
        {
          cloudWatchLogs: {
            rowsReturned: 2,
            statistics: { bytesScanned: 2048, recordsScanned: 100, recordsMatched: 2 },
            queryExecutions: [
              {
                queryId: 'qid-1',
                profile: 'profile-1',
                logGroups: ['/aws/logs'],
                statistics: { bytesScanned: 2048, recordsScanned: 100, recordsMatched: 2 },
              },
            ],
          },
        },
      )
      .build(emptyContext(), 'completed', ENV);

    assert.strictEqual(trace.pipeline[0]?.diagnostics?.cloudWatchLogs?.statistics.bytesScanned, 2048);
    assert.strictEqual(trace.pipeline[0]?.diagnostics?.cloudWatchLogs?.queryExecutions[0]?.queryId, 'qid-1');
  });

  describe('traceEarlyResolution', () => {
    it('promotes evaluations into caseEvaluations when the early resolution matched', () => {
      const evaluations: CaseEvaluationTrace[] = [
        {
          caseId: 'pdv-404',
          description: 'PDV 404',
          priority: 100,
          condition: { type: 'pattern', ref: 'vars.x', regex: 'foo' },
          matched: true,
          resolvedValues: { 'vars.x': 'foo' },
        },
        {
          caseId: 'other-case',
          description: 'Other',
          priority: 50,
          condition: { type: 'pattern', ref: 'vars.x', regex: 'bar' },
          matched: false,
          resolvedValues: { 'vars.x': 'foo' },
        },
      ];

      const trace = builderWithOneStep()
        .traceEarlyResolution({
          resolved: true,
          matchedCaseIds: ['pdv-404'],
          evaluations,
        })
        .build(emptyContext(), 'completed', ENV);

      // Top-level caseMatching reflects the early resolution.
      assert.strictEqual(trace.caseMatching.casesEvaluated, 2);
      assert.deepStrictEqual(trace.caseMatching.matchedCaseIds, ['pdv-404']);
      // Summary outcome must NOT be `no-match` when a case actually matched.
      assert.notStrictEqual(trace.summary.description.includes('no known case matched'), true);
      // Step trace still carries the full early-resolution detail.
      assert.strictEqual(trace.pipeline[0]?.earlyResolution?.resolved, true);
      assert.deepStrictEqual(trace.pipeline[0]?.earlyResolution?.matchedCaseIds, ['pdv-404']);
    });

    it('does NOT promote evaluations when the early resolution had no match', () => {
      const evaluations: CaseEvaluationTrace[] = [
        {
          caseId: 'pdv-404',
          description: 'PDV 404',
          priority: 100,
          condition: { type: 'pattern', ref: 'vars.x', regex: 'foo' },
          matched: false,
          resolvedValues: { 'vars.x': 'bar' },
        },
      ];

      const trace = builderWithOneStep()
        .traceEarlyResolution({
          resolved: false,
          matchedCaseIds: [],
          evaluations,
        })
        .build(emptyContext(), 'completed', ENV);

      // No promotion: caseEvaluations stays empty, ready for a later
      // matchKnownCases pass to populate it.
      assert.strictEqual(trace.caseMatching.casesEvaluated, 0);
      assert.deepStrictEqual(trace.caseMatching.matchedCaseIds, []);
      // Step still carries the failed early-resolve detail.
      assert.strictEqual(trace.pipeline[0]?.earlyResolution?.resolved, false);
    });

    it('is a no-op when there is no step trace to attach to', () => {
      // Brand-new builder, no step yet.
      const trace = new TraceBuilder('exec', RUNBOOK, new Map())
        .traceEarlyResolution({
          resolved: true,
          matchedCaseIds: ['x'],
          evaluations: [
            {
              caseId: 'x',
              description: '',
              priority: 1,
              condition: { type: 'exists', ref: 'vars.x' },
              matched: true,
              resolvedValues: {},
            },
          ],
        })
        .build(emptyContext(), 'completed', ENV);

      // No step trace, no promotion, no crash.
      assert.strictEqual(trace.pipeline.length, 0);
      assert.deepStrictEqual(trace.caseMatching.matchedCaseIds, []);
    });
  });
});
