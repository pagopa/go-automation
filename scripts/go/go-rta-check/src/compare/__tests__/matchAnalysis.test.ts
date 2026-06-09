import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookOutput } from '@go-automation/go-runbook';

import { matchAnalysis } from '../matchAnalysis.js';
import type { MatchAnalysisOptions } from '../matchAnalysis.js';
import type { AlarmAnalysisDto } from '../../types/WatchtowerDtos.js';
import type { RunbookCheck } from '../../types/RtaCheckReport.js';

const NOW = '2026-01-01T00:00:00.000Z';
const OPTIONS: MatchAnalysisOptions = { includeIgnorable: false, includeIncomplete: false };
const HIT: RunbookCheck = {
  status: 'HIT',
  primaryCaseId: 'lambda-timeout',
  primaryCaseDescription: 'Timeout runtime della Lambda',
  matchedCaseIds: ['lambda-timeout'],
};

function outputWithRequestId(requestId: string): RunbookOutput {
  return {
    schemaVersion: '1.0.0',
    generatedAt: NOW,
    runbook: { id: 'r', name: 'r', type: 'alarm-resolution', version: '1.0.0', team: 'GO' },
    execution: {
      executionId: 'e',
      startedAt: NOW,
      completedAt: NOW,
      durationMs: 1,
      status: 'completed',
      stepsExecuted: 1,
      earlyResolution: false,
      recoveredErrors: [],
    },
    input: {},
    outcome: {
      kind: 'known-case-matched',
      primaryCaseId: 'lambda-timeout',
      primaryCaseDescription: 'Timeout runtime della Lambda',
      matchedCases: [
        { id: 'lambda-timeout', description: 'Timeout', priority: 100, resolvedMessage: 'Timeout Lambda' },
      ],
      message: 'm',
    },
    context: { fields: [{ name: 'lambdaRequestId', label: 'requestId', value: requestId }], evidence: [] },
  };
}

function analysis(partial: Partial<AlarmAnalysisDto>): AlarmAnalysisDto {
  return {
    id: 'a',
    analysisType: 'ANALYZABLE',
    status: 'COMPLETED',
    occurrences: 1,
    firstAlarmAt: NOW,
    lastAlarmAt: NOW,
    errorDetails: null,
    conclusionNotes: null,
    trackingIds: [],
    downstreams: [],
    resources: [],
    finalActions: [],
    ...partial,
  };
}

describe('matchAnalysis', () => {
  it('NOT_LINKED when there is no analysis', () => {
    const result = matchAnalysis(outputWithRequestId('r1'), HIT, undefined, NOW, OPTIONS);
    assert.strictEqual(result.status, 'NOT_LINKED');
  });

  it('MATCH_EXACT when a traceId overlaps the runbook requestId', () => {
    const linked = analysis({ trackingIds: [{ traceId: 'r1', timestamp: NOW }] });
    const result = matchAnalysis(outputWithRequestId('r1'), HIT, linked, NOW, OPTIONS);
    assert.strictEqual(result.status, 'MATCH_EXACT');
    assert.deepStrictEqual(result.signals.traceIdOverlap, ['r1']);
  });

  it('NOT_ANALYZED for an IGNORABLE analysis by default', () => {
    const ignorable = analysis({ analysisType: 'IGNORABLE' });
    const result = matchAnalysis(outputWithRequestId('r1'), HIT, ignorable, NOW, OPTIONS);
    assert.strictEqual(result.status, 'NOT_ANALYZED');
  });

  it('NO_EVIDENCE when the runbook did not match a case', () => {
    const miss: RunbookCheck = { status: 'MISS', matchedCaseIds: [] };
    const linked = analysis({ errorDetails: 'qualcosa' });
    const result = matchAnalysis(outputWithRequestId('r1'), miss, linked, NOW, OPTIONS);
    assert.strictEqual(result.status, 'NO_EVIDENCE');
  });
});
