import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { EvidenceIdentifierKind } from '@pagopa/go-runbook';
import type { RunbookOutput } from '@pagopa/go-runbook/output';

import { matchAnalysis } from '../matchAnalysis.js';
import type { MatchAnalysisOptions } from '../matchAnalysis.js';
import { pickTrackingExcerpt } from '../../evidence/extractAnalysisEvidence.js';
import { alarmAnalysisFixture as analysis, HIT, NOW, runbookOutputFixture } from './comparisonFixtures.js';

const OPTIONS: MatchAnalysisOptions = { includeIgnorable: false, includeIncomplete: false };
const TRACE = '1-6789abcd-0123456789abcdef01234567';
const COMPACT = '6789abcd0123456789abcdef01234567';

/** An output whose detected case observed one identifier of the given kind. */
function observing(kind: EvidenceIdentifierKind, value: string): RunbookOutput {
  const base = runbookOutputFixture('unrelated');
  if (base.outcome.kind !== 'known-error-matched') throw new Error('fixture');
  const [detection] = base.outcome.detections;
  if (detection === undefined) throw new Error('fixture');
  return {
    ...base,
    outcome: { ...base.outcome, detections: [{ ...detection, observations: [{ kind, value }] }] },
  };
}

function overlap(output: RunbookOutput, annotated: string): ReadonlyArray<string> {
  const linked = analysis({ trackingIds: [{ traceId: annotated, timestamp: NOW }] });
  return matchAnalysis(output, HIT, linked, NOW, OPTIONS).signals.traceIdOverlap;
}

describe('trace identity in the comparison with Watchtower', () => {
  it('matches a trace id observation with the same trace annotated in compact form', () => {
    assert.deepStrictEqual(overlap(observing('traceId', TRACE), COMPACT.toUpperCase()), [TRACE]);
  });

  it('never matches a request id with the X-Ray form of the same hex digits', () => {
    assert.deepStrictEqual(overlap(observing('requestId', COMPACT), TRACE), []);
    assert.deepStrictEqual(overlap(observing('requestId', COMPACT), COMPACT.toUpperCase()), [COMPACT]);
  });

  it('keeps two different values that are not trace ids apart', () => {
    assert.deepStrictEqual(overlap(observing('traceId', 'legacy-a'), 'legacy-b'), []);
  });

  it('picks the tracking entry of the same trace in another form, never of a request id with its hex digits', () => {
    const linked = analysis({
      trackingIds: [{ traceId: COMPACT, timestamp: NOW, errorCode: 'E1', errorDetail: 'timeout' }],
    });
    assert.equal(pickTrackingExcerpt(linked, [TRACE], NOW, undefined, [TRACE]), 'E1 — timeout');
    assert.equal(pickTrackingExcerpt(linked, ['legacy-a'], NOW, undefined, ['legacy-a']), undefined);
    const xray = analysis({
      trackingIds: [{ traceId: TRACE, timestamp: NOW, errorCode: 'E1', errorDetail: 'timeout' }],
    });
    assert.equal(pickTrackingExcerpt(xray, [COMPACT], NOW), undefined);
  });
});
