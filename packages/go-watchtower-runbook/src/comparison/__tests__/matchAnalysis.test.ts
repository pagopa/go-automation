import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AlarmAnalysisDto, IgnoreReasonDto } from '@go-automation/go-watchtower-client';

import { matchAnalysis } from '../matchAnalysis.js';
import type { MatchAnalysisOptions } from '../matchAnalysis.js';
import type { RunbookCheck } from '../../types/RtaCheckReport.js';
import type { ErrorChainGroup } from '@pagopa/go-runbook/output';
import { alarmAnalysisFixture as analysis, HIT, NOW, runbookOutputFixture } from './comparisonFixtures.js';

const OPTIONS: MatchAnalysisOptions = { includeIgnorable: false, includeIncomplete: false };
const OUTPUT = runbookOutputFixture('r1');

function ignoreReason(code: string, label: string): IgnoreReasonDto {
  return { code, description: null, detailsSchema: null, label, sortOrder: 1 };
}

describe('matchAnalysis', () => {
  it('NOT_LINKED when there is no analysis', () => {
    assert.strictEqual(matchAnalysis(OUTPUT, HIT, undefined, NOW, OPTIONS).status, 'NOT_LINKED');
  });

  it('MATCH_STRONG, never MATCH_EXACT, when a traceId overlaps the runbook requestId', () => {
    const linked = analysis({ trackingIds: [{ traceId: 'r1', timestamp: NOW }] });
    const result = matchAnalysis(OUTPUT, HIT, linked, NOW, OPTIONS);
    assert.strictEqual(result.status, 'MATCH_STRONG');
    assert.deepStrictEqual(result.signals.traceIdOverlap, ['r1']);
  });

  it('compares human tracking within the evidence window of the runbook, not ten minutes around the alarm', () => {
    const windowed = {
      ...OUTPUT,
      input: { startTime: '2025-12-31T23:30:00.000Z', endTime: '2026-01-01T00:01:00.000Z' },
    };
    const before = analysis({ trackingIds: [{ traceId: 'r1', timestamp: '2025-12-31T23:40:00Z' }] });
    assert.deepStrictEqual(matchAnalysis(windowed, HIT, before, NOW, OPTIONS).signals.traceIdOverlap, ['r1']);
    const after = analysis({ trackingIds: [{ traceId: 'r1', timestamp: '2026-01-01T00:05:00Z' }] });
    assert.deepStrictEqual(matchAnalysis(windowed, HIT, after, NOW, OPTIONS).signals.traceIdOverlap, []);
  });

  it('matches an identifier only with the detected case that observed it', () => {
    const base = runbookOutputFixture('unrelated');
    if (base.outcome.kind !== 'known-case-matched') throw new Error('fixture');
    const output = {
      ...base,
      outcome: {
        ...base.outcome,
        detections: [
          {
            caseId: 'a',
            description: 'Primo caso',
            evidenceRows: 1,
            observations: [{ kind: 'cid' as const, value: 'cid-a' }],
          },
          {
            caseId: 'b',
            description: 'Secondo caso',
            evidenceRows: 1,
            observations: [{ kind: 'cid' as const, value: 'cid-b' }],
          },
        ],
      },
      chains: [chain('a', 'cid-a'), chain('b', 'cid-b')],
    };
    const linked = analysis({ trackingIds: [{ traceId: 'cid-b', timestamp: NOW }] });
    const result = matchAnalysis(output, { status: 'HIT', matchedCaseIds: ['a', 'b'] }, linked, NOW, OPTIONS);
    assert.deepStrictEqual(result.signals.traceIdOverlap, ['cid-b']);
    assert.ok(result.reasons.some((reason) => reason.includes('confronto sul caso "b"')));
  });

  it('does not lend the context identifiers to a case without observations when another case has its own', () => {
    const base = runbookOutputFixture('r1');
    if (base.outcome.kind !== 'known-case-matched') throw new Error('fixture');
    const output = {
      ...base,
      outcome: {
        ...base.outcome,
        detections: [
          {
            caseId: 'a',
            description: 'Primo caso',
            evidenceRows: 1,
            observations: [{ kind: 'cid' as const, value: 'cid-a' }],
          },
          { caseId: 'b', description: 'Secondo caso', evidenceRows: 1, observations: [] },
        ],
      },
      chains: [chain('a', 'cid-a')],
    };
    const linked = analysis({ trackingIds: [{ traceId: 'r1', timestamp: NOW }] });
    const result = matchAnalysis(output, { status: 'HIT', matchedCaseIds: ['a', 'b'] }, linked, NOW, OPTIONS);
    assert.deepStrictEqual(result.signals.traceIdOverlap, []);
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
    const result = matchAnalysis(OUTPUT, HIT, linked, NOW, OPTIONS);

    assert.strictEqual(result.status, 'MATCH_STRONG');
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
    const result = matchAnalysis(OUTPUT, HIT, linked, NOW, OPTIONS);

    assert.notStrictEqual(result.status, 'MATCH_STRONG');
    assert.deepStrictEqual(result.signals.traceIdOverlap, []);
    assert.strictEqual(result.analysisExcerpt, 'Timeout runtime della Lambda');
  });

  it('IGNORED by default for an IGNORABLE analysis, with the flat or nested reason code if any', () => {
    const cases: ReadonlyArray<readonly [string, Partial<AlarmAnalysisDto>, string | undefined, string | undefined]> = [
      [
        'flat code',
        { ignoreReasonCode: 'FALSE_POSITIVE', ignoreReason: ignoreReason('FALSE_POSITIVE', 'Falso positivo') },
        'FALSE_POSITIVE',
        'Falso positivo',
      ],
      [
        'nested code only',
        { ignoreReasonCode: null, ignoreReason: ignoreReason('MAINTENANCE', 'Manutenzione programmata') },
        'MAINTENANCE',
        'Manutenzione programmata',
      ],
      ['no reason', {}, undefined, undefined],
    ];

    for (const [name, fields, code, label] of cases) {
      const result = matchAnalysis(OUTPUT, HIT, analysis({ analysisType: 'IGNORABLE', ...fields }), NOW, OPTIONS);

      assert.strictEqual(result.status, 'IGNORED', name);
      assert.strictEqual(result.ignoreReasonCode, code, name);
      assert.strictEqual(result.ignoreReasonLabel, label, name);
    }
  });

  it('names the ignore reason in the explanation', () => {
    const ignorable = analysis({
      analysisType: 'IGNORABLE',
      ignoreReasonCode: 'FALSE_POSITIVE',
      ignoreReason: ignoreReason('FALSE_POSITIVE', 'Falso positivo'),
    });

    const result = matchAnalysis(OUTPUT, HIT, ignorable, NOW, OPTIONS);

    assert.match(result.reasons[0] ?? '', /FALSE_POSITIVE \(Falso positivo\)/);
  });

  it('does not ignore the analysis when includeIgnorable is set', () => {
    const ignorable = analysis({
      analysisType: 'IGNORABLE',
      ignoreReasonCode: 'FALSE_POSITIVE',
      trackingIds: [{ traceId: 'r1', timestamp: NOW }],
    });
    const result = matchAnalysis(OUTPUT, HIT, ignorable, NOW, { ...OPTIONS, includeIgnorable: true });

    assert.strictEqual(result.status, 'MATCH_STRONG');
  });

  it('NOT_ANALYZED stays reserved for analyses that are not COMPLETED', () => {
    const result = matchAnalysis(OUTPUT, HIT, analysis({ status: 'IN_PROGRESS' }), NOW, OPTIONS);

    assert.strictEqual(result.status, 'NOT_ANALYZED');
    assert.strictEqual(result.ignoreReasonCode, undefined);
    assert.match(result.reasons[0] ?? '', /IN_PROGRESS/);
  });

  it('NO_EVIDENCE when the runbook did not match a case', () => {
    const miss: RunbookCheck = { status: 'MISS', matchedCaseIds: [] };
    const result = matchAnalysis(OUTPUT, miss, analysis({ errorDetails: 'qualcosa' }), NOW, OPTIONS);
    assert.strictEqual(result.status, 'NO_EVIDENCE');
  });
});

function chain(caseId: string, cid: string): ErrorChainGroup {
  return {
    nodes: [{ level: 0, target: 'window', label: caseId, caseIds: [caseId], status: 'recognized' }],
    end: 'leaf',
    interruptions: [],
    incompleteEvidence: false,
    count: 1,
    routes: [],
    samples: [{ key: caseId, correlation: {} }],
    members: [{ key: caseId, correlation: {} }],
    observations: [{ kind: 'cid', value: cid }],
  };
}
