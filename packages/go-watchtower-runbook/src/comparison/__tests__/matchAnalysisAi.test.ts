import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { RunbookOutput } from '@go-automation/go-runbook';
import type { GOAISemanticMatcher } from '@go-automation/go-ai';

import { matchAnalysisAi } from '../matchAnalysisAi.js';
import type { RunbookCheck } from '../../types/RtaCheckReport.js';
import { alarmAnalysisFixture as analysis } from './alarmAnalysisFixture.js';

const NOW = '2026-01-01T00:00:00.000Z';
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
      message: 'La Lambda ha superato il timeout configurato.',
    },
    context: { fields: [{ name: 'lambdaRequestId', label: 'requestId', value: requestId }], evidence: [] },
  };
}

function semanticMatcher(score: number): Pick<GOAISemanticMatcher, 'match'> {
  return {
    match: async () => {
      await Promise.resolve();
      return {
        score,
        explanation: 'Entrambe le analisi indicano un timeout Lambda.',
        verdict: score >= 70 ? 'equivalent' : 'conflicting',
      };
    },
  };
}

function semanticMatcherResult(
  score: number,
  verdict: 'equivalent' | 'conflicting',
): Pick<GOAISemanticMatcher, 'match'> {
  return {
    match: async () => {
      await Promise.resolve();
      return {
        score,
        explanation: 'Risultato semantico controllato dal test.',
        verdict,
      };
    },
  };
}

describe('matchAnalysisAi', () => {
  it('uses GO-AI semantic score for non-exact HIT comparisons', async () => {
    const linked = analysis({ errorDetails: 'La funzione Lambda non ha completato entro il tempo massimo.' });
    const result = await matchAnalysisAi(outputWithRequestId('r1'), HIT, linked, NOW, {
      includeIgnorable: false,
      includeIncomplete: false,
      semanticMatcher: semanticMatcher(88),
      semanticThreshold: 70,
      fallbackToLexical: true,
    });

    assert.strictEqual(result.status, 'MATCH_STRONG');
    assert.strictEqual(result.matcher, 'ai');
    assert.strictEqual(result.aiAttempted, true);
    assert.strictEqual(result.aiFallback, undefined);
    assert.strictEqual(result.aiError, undefined);
    assert.strictEqual(result.signals.semanticScore, 88);
    assert.strictEqual(result.signals.semanticVerdict, 'equivalent');
  });

  it('maps low AI similarity to NO_EVIDENCE when it is not a strong contradiction', async () => {
    const linked = analysis({ errorDetails: 'Testo operatore scarno e non specifico.' });
    const result = await matchAnalysisAi(outputWithRequestId('r1'), HIT, linked, NOW, {
      includeIgnorable: false,
      includeIncomplete: false,
      semanticMatcher: semanticMatcherResult(45, 'conflicting'),
      semanticThreshold: 70,
      fallbackToLexical: true,
    });

    assert.strictEqual(result.status, 'NO_EVIDENCE');
    assert.strictEqual(result.matcher, 'ai');
    assert.strictEqual(result.aiAttempted, true);
    assert.strictEqual(result.signals.semanticScore, 45);
  });

  it('maps very low conflicting AI similarity to CONFLICT', async () => {
    const linked = analysis({ errorDetails: 'Testo operatore con causa diversa.' });
    const result = await matchAnalysisAi(outputWithRequestId('r1'), HIT, linked, NOW, {
      includeIgnorable: false,
      includeIncomplete: false,
      semanticMatcher: semanticMatcherResult(20, 'conflicting'),
      semanticThreshold: 70,
      fallbackToLexical: true,
    });

    assert.strictEqual(result.status, 'CONFLICT');
    assert.strictEqual(result.matcher, 'ai');
    assert.strictEqual(result.aiAttempted, true);
    assert.strictEqual(result.signals.semanticScore, 20);
  });

  it('keeps MATCH_EXACT and still audits operator text with GO-AI on deterministic trace overlap', async () => {
    const linked = analysis({
      trackingIds: [{ traceId: 'r1', timestamp: NOW, errorDetail: 'Timeout Lambda confermato' }],
    });
    let invoked = false;
    const result = await matchAnalysisAi(outputWithRequestId('r1'), HIT, linked, NOW, {
      includeIgnorable: false,
      includeIncomplete: false,
      semanticMatcher: {
        match: async () => {
          await Promise.resolve();
          invoked = true;
          return { score: 90, explanation: 'Stessa diagnosi.', verdict: 'equivalent' };
        },
      },
      semanticThreshold: 70,
      fallbackToLexical: true,
    });

    assert.strictEqual(result.status, 'MATCH_EXACT');
    assert.strictEqual(result.matcher, 'deterministic+ai');
    assert.strictEqual(result.aiAttempted, true);
    assert.strictEqual(invoked, true);
    assert.deepStrictEqual(result.signals.traceIdOverlap, ['r1']);
    assert.strictEqual(result.signals.semanticScore, 90);
    assert.strictEqual(result.semanticExplanation, 'Stessa diagnosi.');
  });

  it('keeps MATCH_EXACT and records a conflicting AI audit when the analysis mentions the matched case id', async () => {
    const linked = analysis({ errorDetails: 'Caso lambda-timeout confermato da Watchtower.' });
    let invoked = false;
    const result = await matchAnalysisAi(outputWithRequestId('r1'), HIT, linked, NOW, {
      includeIgnorable: false,
      includeIncomplete: false,
      semanticMatcher: {
        match: async () => {
          await Promise.resolve();
          invoked = true;
          return { score: 20, explanation: 'Il testo operatore descrive una causa diversa.', verdict: 'conflicting' };
        },
      },
      semanticThreshold: 70,
      fallbackToLexical: true,
    });

    assert.strictEqual(result.status, 'MATCH_EXACT');
    assert.strictEqual(result.matcher, 'deterministic+ai');
    assert.strictEqual(result.aiAttempted, true);
    assert.strictEqual(invoked, true);
    assert.strictEqual(result.signals.caseIdMentioned, true);
    assert.strictEqual(result.signals.semanticScore, 20);
    assert.strictEqual(result.signals.semanticVerdict, 'conflicting');
    assert.match(result.reasons.join('\n'), /possibile divergenza/);
  });

  it('keeps MATCH_EXACT visible when the AI audit fails on a deterministic match', async () => {
    const linked = analysis({
      trackingIds: [{ traceId: 'r1', timestamp: NOW, errorDetail: 'Timeout Lambda confermato' }],
    });
    const result = await matchAnalysisAi(outputWithRequestId('r1'), HIT, linked, NOW, {
      includeIgnorable: false,
      includeIncomplete: false,
      semanticMatcher: {
        match: async () => {
          await Promise.resolve();
          throw new Error('Bedrock unavailable');
        },
      },
      semanticThreshold: 70,
      fallbackToLexical: true,
    });

    assert.strictEqual(result.status, 'MATCH_EXACT');
    assert.strictEqual(result.matcher, 'deterministic');
    assert.strictEqual(result.aiAttempted, true);
    assert.strictEqual(result.aiFallback, undefined);
    assert.strictEqual(result.aiError, 'Bedrock unavailable');
    assert.match(result.reasons.join('\n'), /MATCH_EXACT mantenuto/);
  });

  it('falls back to lexical comparison when GO-AI fails and fallback is enabled', async () => {
    const linked = analysis({ errorDetails: 'Timeout runtime della Lambda' });
    const result = await matchAnalysisAi(outputWithRequestId('r1'), HIT, linked, NOW, {
      includeIgnorable: false,
      includeIncomplete: false,
      semanticMatcher: {
        match: async () => {
          await Promise.resolve();
          throw new Error('Bedrock unavailable');
        },
      },
      semanticThreshold: 70,
      fallbackToLexical: true,
    });

    assert.strictEqual(result.matcher, 'lexical');
    assert.strictEqual(result.aiAttempted, true);
    assert.strictEqual(result.aiFallback, true);
    assert.strictEqual(result.aiError, 'Bedrock unavailable');
    assert.match(result.reasons.join('\n'), /fallback lessicale/);
  });
});
