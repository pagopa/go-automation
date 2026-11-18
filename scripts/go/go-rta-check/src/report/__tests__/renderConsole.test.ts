import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AnalysisMatch, RtaCheckRow } from '@go-automation/go-watchtower-runbook';
import { formatVerificationCell } from '../renderConsole.js';

function row(partial: Partial<AnalysisMatch>): RtaCheckRow {
  return {
    event: {
      id: 'e',
      firedAt: '2026-01-01T00:00:00.000Z',
      awsAccountId: 'a',
      awsRegion: 'eu-south-1',
    },
    runbook: { status: 'HIT', matchedCaseIds: ['case'] },
    comparison: {
      status: 'MATCH_STRONG',
      confidence: 0.88,
      reasons: [],
      signals: {
        caseIdMentioned: false,
        descriptionOverlap: 0,
        traceIdOverlap: [],
        downstreamOverlap: [],
        errorKeywordOverlap: [],
      },
      ...partial,
    },
    fromCache: false,
  };
}

describe('formatVerificationCell', () => {
  const ignored = { status: 'IGNORED', confidence: 0, aiAttempted: false } as const;
  const cases: ReadonlyArray<readonly [string, Partial<AnalysisMatch>, string]> = [
    ['the verification was computed by AI', { matcher: 'ai', aiAttempted: true }, 'MATCH_STRONG (0.88) · ai'],
    [
      'lexical fallback was used after an AI error',
      { matcher: 'lexical', aiAttempted: true, aiFallback: true, aiError: 'Bedrock down' },
      'MATCH_STRONG (0.88) · lexical fallback',
    ],
    [
      'deterministic evidence was also audited by AI',
      { status: 'MATCH_EXACT', matcher: 'deterministic+ai', aiAttempted: true },
      'MATCH_EXACT (0.88) · deterministic+ai',
    ],
    [
      'deterministic evidence preserved the match without AI result',
      { status: 'MATCH_EXACT', matcher: 'deterministic', aiAttempted: false },
      'MATCH_EXACT (0.88) · deterministic',
    ],
    ['AI was not applicable to the row', { aiAttempted: false }, 'MATCH_STRONG (0.88) · n/a'],
    [
      'an ignored analysis has a reason code, shown instead of the matcher',
      { ...ignored, matcher: 'lexical', ignoreReasonCode: 'FALSE_POSITIVE', ignoreReasonLabel: 'Falso positivo' },
      'IGNORED (FALSE_POSITIVE)',
    ],
    [
      'an ignored analysis has only a reason label',
      { ...ignored, ignoreReasonLabel: 'Falso positivo' },
      'IGNORED (Falso positivo)',
    ],
    ['an ignored analysis carries no reason', ignored, 'IGNORED'],
  ];

  for (const [when, comparison, expected] of cases) {
    it(`renders ${expected} when ${when}`, () => {
      assert.strictEqual(formatVerificationCell(row(comparison)), expected);
    });
  }
});
