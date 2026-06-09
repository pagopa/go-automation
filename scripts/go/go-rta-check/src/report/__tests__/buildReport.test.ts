import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildSummary } from '../buildReport.js';
import type { RtaCheckRow, V1Status, V2Status } from '../../types/RtaCheckReport.js';

function makeRow(status: V1Status, v2: V2Status, analysisId?: string): RtaCheckRow {
  return {
    event: {
      id: 'e',
      firedAt: '2026-01-01T00:00:00.000Z',
      awsAccountId: 'a',
      awsRegion: 'eu-south-1',
      ...(analysisId !== undefined ? { analysisId } : {}),
    },
    runbook: { status, matchedCaseIds: [], durationMs: 100, cloudWatchRecordsScanned: 10 },
    comparison: {
      status: v2,
      confidence: 0,
      reasons: [],
      signals: {
        caseIdMentioned: false,
        descriptionOverlap: 0,
        traceIdOverlap: [],
        downstreamOverlap: [],
        errorKeywordOverlap: [],
      },
    },
    fromCache: false,
  };
}

describe('buildSummary', () => {
  it('computes V1 counts, coverage and the V2 distribution', () => {
    const rows = [
      makeRow('HIT', 'MATCH_EXACT', 'a1'),
      makeRow('HIT', 'MATCH_STRONG'),
      makeRow('MISS', 'NO_EVIDENCE', 'a2'),
      makeRow('NO-DATA', 'NOT_LINKED'),
      makeRow('CONFIG-ERROR', 'NOT_LINKED'),
    ];
    const summary = buildSummary(rows);

    assert.strictEqual(summary.totalEvents, 5);
    assert.strictEqual(summary.hit, 2);
    assert.strictEqual(summary.miss, 1);
    assert.strictEqual(summary.noData, 1);
    assert.strictEqual(summary.configError, 1);
    assert.strictEqual(summary.linkedAnalyses, 2);
    // HIT / (HIT + MISS) = 2/3
    assert.strictEqual(summary.automationCoveragePct, Number(((2 / 3) * 100).toFixed(1)));
    assert.strictEqual(summary.analysisCompatibility.MATCH_EXACT, 1);
    assert.strictEqual(summary.analysisCompatibility.NOT_LINKED, 2);
  });
});
