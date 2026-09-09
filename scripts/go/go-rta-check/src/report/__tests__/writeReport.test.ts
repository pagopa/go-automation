import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RtaCheckRow } from '@go-automation/go-watchtower-runbook';
import { reportSubdirectory, toHtmlRow } from '../writeReport.js';

function rowWithAiExplanation(explanation: string): RtaCheckRow {
  return {
    event: {
      id: 'e',
      firedAt: '2026-01-01T00:00:00.000Z',
      awsAccountId: 'a',
      awsRegion: 'eu-south-1',
      analysisId: 'analysis-1',
    },
    runbook: {
      status: 'HIT',
      primaryCaseId: 'lambda-timeout',
      matchedCaseIds: ['lambda-timeout'],
    },
    comparison: {
      status: 'MATCH_STRONG',
      confidence: 0.87,
      reasons: ['GO-AI semantic-match score 87/100: equivalent', explanation],
      matcher: 'ai',
      aiAttempted: true,
      signals: {
        caseIdMentioned: false,
        descriptionOverlap: 0,
        traceIdOverlap: [],
        downstreamOverlap: [],
        errorKeywordOverlap: [],
        semanticScore: 87,
        semanticVerdict: 'equivalent',
      },
      semanticExplanation: explanation,
    },
    fromCache: false,
  };
}

describe('toHtmlRow', () => {
  it('exports the full AI detail without truncating the note', () => {
    const explanation = 'Entrambe le analisi indicano lo stesso timeout Lambda. '.repeat(8);
    const exported = toHtmlRow(rowWithAiExplanation(explanation));

    assert.strictEqual(exported.note, explanation);
    assert.strictEqual(exported.aiExplanation, explanation);
    assert.strictEqual(exported.aiVerdict, 'equivalent');
    assert.strictEqual(exported.semanticScore, '87');
    assert.match(exported.aiDetail, /"semanticScore": 87/);
    assert.match(exported.aiDetail, /"semanticVerdict": "equivalent"/);
    assert.ok(exported.aiDetail.includes(explanation));
  });
});

describe('reportSubdirectory', () => {
  it('prefixes the folder with the position of the run in the session', () => {
    assert.strictEqual(reportSubdirectory(1, 'pn-delivery-B2B-ApiGwAlarm'), '01-pn-delivery-B2B-ApiGwAlarm');
    assert.strictEqual(reportSubdirectory(12, 'pn-delivery-B2B-ApiGwAlarm'), '12-pn-delivery-B2B-ApiGwAlarm');
  });

  it('keeps two runs of the same runbook apart', () => {
    assert.notStrictEqual(reportSubdirectory(1, 'same-alarm'), reportSubdirectory(2, 'same-alarm'));
  });

  it('drops the characters a folder name must not carry', () => {
    assert.strictEqual(reportSubdirectory(3, 'pn-delivery/B2B Alarm'), '03-pn-delivery-B2B-Alarm');
    assert.strictEqual(reportSubdirectory(4, '../escape'), '04-escape');
  });

  it('falls back to the bare ordinal when nothing usable is left', () => {
    assert.strictEqual(reportSubdirectory(5, '///'), '05');
  });
});
