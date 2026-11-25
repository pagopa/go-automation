import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { ExecutionEnvironment } from '../ExecutionEnvironment.js';
import type { StepDiagnostics } from '../StepDiagnostics.js';
import { TraceBuilder } from '../TraceBuilder.js';
import { createTestContext } from '../../../__tests__/helpers/createTestContext.js';
import { createTestRunbook } from '../../../__tests__/helpers/createTestRunbook.js';
import type { KnownCase } from '../../types/KnownCase.js';

const RUNBOOK = createTestRunbook();

const ENV: ExecutionEnvironment = {
  awsProfiles: [],
  region: 'eu-south-1',
  invokedBy: 'manual',
};

/** A TraceBuilder primed with one step. */
function builderWithOneStep(diagnostics?: StepDiagnostics): TraceBuilder {
  const builder = new TraceBuilder('exec', RUNBOOK, new Map());
  builder.traceStep({
    stepId: 'analyze-x',
    label: 'Analyze x',
    kind: 'transform',
    reachedVia: 'sequential',
    startedAt: '2026-05-13T00:00:00.000Z',
    completedAt: '2026-05-13T00:00:00.001Z',
    durationMs: 1,
    status: 'success',
    recovered: false,
    input: {},
    output: null,
    varsWritten: {},
    flowDirective: 'continue',
    ...(diagnostics === undefined ? {} : { diagnostics }),
  });
  return builder;
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

  describe('detections and coverage', () => {
    const knownCase = (id: string): KnownCase => ({
      id,
      description: `Case ${id}`,
      condition: { type: 'exists', ref: 'vars.x' },
      action: { type: 'log', level: 'info', title: id },
    });

    it('reports the detections in the order recorded, with every evaluation in declaration order', () => {
      const builder = builderWithOneStep();
      builder.traceCaseEvaluation(
        knownCase('a'),
        true,
        {},
        { firstSeenAt: '2026-05-13T10:05:00.000Z', evidenceRows: 1 },
      );
      builder.traceCaseEvaluation(
        knownCase('b'),
        true,
        {},
        { firstSeenAt: '2026-05-13T10:01:00.000Z', evidenceRows: 2 },
      );
      builder.traceCaseEvaluation(knownCase('c'), true, {}, { supersededBy: 'a', evidenceRows: 1 });
      builder.traceDetections(['b', 'a']);
      const trace = builder.build(createTestContext(), 'completed', ENV);

      assert.deepStrictEqual(trace.caseMatching.matchedCaseIds, ['b', 'a']);
      assert.deepStrictEqual(
        trace.caseMatching.evaluations.map((e) => e.caseId),
        ['a', 'b', 'c'],
      );
      assert.strictEqual(trace.caseMatching.evaluations[2]?.supersededBy, 'a');
      assert.strictEqual(
        trace.summary.description,
        'Runbook "Test runbook" completed: identified 2 cases "Case b", "Case a"',
      );
    });

    it('records the coverage of the execution', () => {
      const builder = builderWithOneStep();
      builder.traceCoverage([{ stepId: 'analyze-x', complete: false, reason: 'saturated' }]);
      const trace = builder.build(createTestContext(), 'completed', ENV);

      assert.deepStrictEqual(trace.coverage, [{ stepId: 'analyze-x', complete: false, reason: 'saturated' }]);
      assert.strictEqual(trace.schemaVersion, '3.0.0');
    });
  });
});
