import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ExecutionEnvironment } from '../ExecutionEnvironment.js';
import type { CaseEvaluationTrace } from '../CaseEvaluationTrace.js';
import type { StepDiagnostics } from '../StepDiagnostics.js';
import { TraceBuilder } from '../TraceBuilder.js';
import { createTestContext } from '../../../__tests__/helpers/createTestContext.js';
import { createTestRunbook } from '../../../__tests__/helpers/createTestRunbook.js';

const RUNBOOK = createTestRunbook();

const ENV: ExecutionEnvironment = {
  awsProfiles: [],
  region: 'eu-south-1',
  invokedBy: 'manual',
};

/** A TraceBuilder primed with one step, so an early resolution can attach to it. */
function builderWithOneStep(diagnostics?: StepDiagnostics): TraceBuilder {
  const builder = new TraceBuilder('exec', RUNBOOK, new Map());
  builder.traceStep(
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
    diagnostics,
  );
  return builder;
}

/** The trace of a `vars.x` case evaluation. */
function evaluation(caseId: string, matched: boolean): CaseEvaluationTrace {
  return {
    caseId,
    description: caseId,
    priority: 1,
    condition: { type: 'exists', ref: 'vars.x' },
    matched,
    resolvedValues: { 'vars.x': 'foo' },
  };
}

describe('TraceBuilder', () => {
  it('stores step diagnostics in the pipeline trace', () => {
    const statistics = { bytesScanned: 2048, recordsScanned: 100, recordsMatched: 2 };
    const builder = builderWithOneStep({
      cloudWatchLogs: {
        rowsReturned: 2,
        statistics,
        queryExecutions: [{ queryId: 'qid-1', profile: 'profile-1', logGroups: ['/aws/logs'], statistics }],
      },
    });
    const trace = builder.build(createTestContext(), 'completed', ENV);

    assert.strictEqual(trace.pipeline[0]?.diagnostics?.cloudWatchLogs?.statistics.bytesScanned, 2048);
    assert.strictEqual(trace.pipeline[0]?.diagnostics?.cloudWatchLogs?.queryExecutions[0]?.queryId, 'qid-1');
  });

  describe('traceEarlyResolution', () => {
    it('promotes evaluations into caseEvaluations when the early resolution matched', () => {
      const evaluations = [evaluation('pdv-404', true), evaluation('other-case', false)];

      const builder = builderWithOneStep();
      builder.traceEarlyResolution({
        resolved: true,
        matchedCaseIds: ['pdv-404'],
        evaluations,
      });
      const trace = builder.build(createTestContext(), 'completed', ENV);

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
      const evaluations = [evaluation('pdv-404', false)];

      const builder = builderWithOneStep();
      builder.traceEarlyResolution({
        resolved: false,
        matchedCaseIds: [],
        evaluations,
      });
      const trace = builder.build(createTestContext(), 'completed', ENV);

      // No promotion: caseEvaluations stays empty, ready for a later
      // matchKnownCases pass to populate it.
      assert.strictEqual(trace.caseMatching.casesEvaluated, 0);
      assert.deepStrictEqual(trace.caseMatching.matchedCaseIds, []);
      // Step still carries the failed early-resolve detail.
      assert.strictEqual(trace.pipeline[0]?.earlyResolution?.resolved, false);
    });

    it('is a no-op when there is no step trace to attach to', () => {
      // Brand-new builder, no step yet.
      const builder = new TraceBuilder('exec', RUNBOOK, new Map());
      builder.traceEarlyResolution({
        resolved: true,
        matchedCaseIds: ['x'],
        evaluations: [evaluation('x', true)],
      });
      const trace = builder.build(createTestContext(), 'completed', ENV);

      // No step trace, no promotion, no crash.
      assert.strictEqual(trace.pipeline.length, 0);
      assert.deepStrictEqual(trace.caseMatching.matchedCaseIds, []);
    });
  });
});
