import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookOutput } from '@go-automation/go-runbook';

import { matchAnalysis } from '../matchAnalysis.js';
import type { MatchAnalysisOptions } from '../matchAnalysis.js';
import type { RunbookCheck } from '../../types/RtaCheckReport.js';
import { alarmAnalysisFixture as analysis } from './alarmAnalysisFixture.js';

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

  it('treats a timezone-less tracking timestamp as UTC occurrence evidence', () => {
    const linked = analysis({
      conclusionNotes: 'Fallback aggregato',
      trackingIds: [
        {
          traceId: 'r1',
          timestamp: '2026-01-01T00:00:30',
          errorCode: '500',
          errorDetail: 'Timeout vicino all’occorrenza',
        },
      ],
    });
    const result = matchAnalysis(outputWithRequestId('r1'), HIT, linked, NOW, OPTIONS);

    assert.strictEqual(result.status, 'MATCH_EXACT');
    assert.strictEqual(result.analysisExcerpt, '500 — Timeout vicino all’occorrenza');
  });

  it('does not use a trackingId from another occurrence as deterministic evidence', () => {
    const linked = analysis({
      conclusionNotes: 'Timeout runtime della Lambda',
      linkedEventsCount: 2,
      occurrences: 2,
      trackingIds: [
        {
          traceId: 'r1',
          timestamp: '2026-01-01T06:00:00Z',
          errorCode: '500',
          errorDetail: 'Errore appartenente a un’altra occorrenza',
        },
      ],
    });
    const result = matchAnalysis(outputWithRequestId('r1'), HIT, linked, NOW, OPTIONS);

    assert.notStrictEqual(result.status, 'MATCH_EXACT');
    assert.deepStrictEqual(result.signals.traceIdOverlap, []);
    assert.strictEqual(result.analysisExcerpt, 'Timeout runtime della Lambda');
  });

  it('IGNORED with the reason code for an IGNORABLE analysis by default', () => {
    const ignorable = analysis({
      analysisType: 'IGNORABLE',
      ignoreReasonCode: 'FALSE_POSITIVE',
      ignoreReason: {
        code: 'FALSE_POSITIVE',
        description: null,
        detailsSchema: null,
        label: 'Falso positivo',
        sortOrder: 1,
      },
    });
    const result = matchAnalysis(outputWithRequestId('r1'), HIT, ignorable, NOW, OPTIONS);

    assert.strictEqual(result.status, 'IGNORED');
    assert.strictEqual(result.ignoreReasonCode, 'FALSE_POSITIVE');
    assert.strictEqual(result.ignoreReasonLabel, 'Falso positivo');
    assert.match(result.reasons[0] ?? '', /FALSE_POSITIVE \(Falso positivo\)/);
  });

  it('IGNORED falls back to the nested ignoreReason code when the flat one is null', () => {
    const ignorable = analysis({
      analysisType: 'IGNORABLE',
      ignoreReasonCode: null,
      ignoreReason: {
        code: 'MAINTENANCE',
        description: null,
        detailsSchema: null,
        label: 'Manutenzione programmata',
        sortOrder: 2,
      },
    });
    const result = matchAnalysis(outputWithRequestId('r1'), HIT, ignorable, NOW, OPTIONS);

    assert.strictEqual(result.status, 'IGNORED');
    assert.strictEqual(result.ignoreReasonCode, 'MAINTENANCE');
  });

  it('IGNORED without a reason when the analysis carries none', () => {
    const ignorable = analysis({ analysisType: 'IGNORABLE' });
    const result = matchAnalysis(outputWithRequestId('r1'), HIT, ignorable, NOW, OPTIONS);

    assert.strictEqual(result.status, 'IGNORED');
    assert.strictEqual(result.ignoreReasonCode, undefined);
    assert.strictEqual(result.ignoreReasonLabel, undefined);
  });

  it('does not ignore the analysis when includeIgnorable is set', () => {
    const ignorable = analysis({
      analysisType: 'IGNORABLE',
      ignoreReasonCode: 'FALSE_POSITIVE',
      trackingIds: [{ traceId: 'r1', timestamp: NOW }],
    });
    const result = matchAnalysis(outputWithRequestId('r1'), HIT, ignorable, NOW, {
      ...OPTIONS,
      includeIgnorable: true,
    });

    assert.strictEqual(result.status, 'MATCH_EXACT');
  });

  it('NOT_ANALYZED stays reserved for analyses that are not COMPLETED', () => {
    const pending = analysis({ status: 'IN_PROGRESS' });
    const result = matchAnalysis(outputWithRequestId('r1'), HIT, pending, NOW, OPTIONS);

    assert.strictEqual(result.status, 'NOT_ANALYZED');
    assert.strictEqual(result.ignoreReasonCode, undefined);
    assert.match(result.reasons[0] ?? '', /IN_PROGRESS/);
  });

  it('NO_EVIDENCE when the runbook did not match a case', () => {
    const miss: RunbookCheck = { status: 'MISS', matchedCaseIds: [] };
    const linked = analysis({ errorDetails: 'qualcosa' });
    const result = matchAnalysis(outputWithRequestId('r1'), miss, linked, NOW, OPTIONS);
    assert.strictEqual(result.status, 'NO_EVIDENCE');
  });
});
