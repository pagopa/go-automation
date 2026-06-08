import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { AnalysisMatch, RtaCheckRow } from '../../types/RtaCheckReport.js';
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
  it('shows when the verification was computed by AI', () => {
    assert.strictEqual(formatVerificationCell(row({ matcher: 'ai', aiAttempted: true })), 'MATCH_STRONG (0.88) · ai');
  });

  it('shows when lexical fallback was used after an AI error', () => {
    assert.strictEqual(
      formatVerificationCell(row({ matcher: 'lexical', aiAttempted: true, aiFallback: true, aiError: 'Bedrock down' })),
      'MATCH_STRONG (0.88) · lexical fallback',
    );
  });

  it('shows n/a when AI was not applicable to the row', () => {
    assert.strictEqual(formatVerificationCell(row({ aiAttempted: false })), 'MATCH_STRONG (0.88) · n/a');
  });
});
