import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { GOAISemanticMatcher, GOSemanticMatchResult } from '@go-automation/go-ai';

import { matchAnalysis } from '../matchAnalysis.js';
import { matchAnalysisAi } from '../matchAnalysisAi.js';
import type { MatchAnalysisAiOptions } from '../matchAnalysisAi.js';
import { alarmAnalysisFixture as analysis, HIT, NOW, runbookOutputFixture } from './comparisonFixtures.js';

type SemanticMatcher = Pick<GOAISemanticMatcher, 'match'>;

const OUTPUT = runbookOutputFixture('r1');

/** Matcher answering with a fixed result, counting its invocations. */
class FixedSemanticMatcher implements SemanticMatcher {
  calls = 0;

  constructor(private readonly result: GOSemanticMatchResult) {}

  async match(): Promise<GOSemanticMatchResult> {
    await Promise.resolve();
    this.calls += 1;
    return this.result;
  }
}

function semanticMatcher(
  score: number,
  verdict: 'equivalent' | 'conflicting',
  explanation = 'Risultato semantico controllato dal test.',
): FixedSemanticMatcher {
  return new FixedSemanticMatcher({ score, explanation, verdict });
}

/** Matcher whose every invocation fails like an unavailable Bedrock. */
function failingMatcher(): SemanticMatcher {
  return {
    match: async () => {
      await Promise.resolve();
      throw new Error('Bedrock unavailable');
    },
  };
}

/** Matcher that fails the test if the AI path is entered at all. */
function neverInvoked(): SemanticMatcher {
  return {
    match: () => {
      throw new Error('semanticMatcher invoked for a comparison the AI must skip');
    },
  };
}

function aiOptions(matcher: SemanticMatcher): MatchAnalysisAiOptions {
  return {
    includeIgnorable: false,
    includeIncomplete: false,
    semanticMatcher: matcher,
    semanticThreshold: 70,
    fallbackToLexical: true,
  };
}

describe('matchAnalysisAi', () => {
  it('maps the AI score of a non-exact HIT comparison to the status', async () => {
    const cases = [
      { score: 88, verdict: 'equivalent', status: 'MATCH_STRONG' },
      // Low similarity that is not a strong contradiction.
      { score: 45, verdict: 'conflicting', status: 'NO_EVIDENCE' },
      { score: 20, verdict: 'conflicting', status: 'CONFLICT' },
    ] as const;

    for (const { score, verdict, status } of cases) {
      const linked = analysis({ errorDetails: 'La funzione Lambda non ha completato entro il tempo massimo.' });
      const result = await matchAnalysisAi(OUTPUT, HIT, linked, NOW, aiOptions(semanticMatcher(score, verdict)));

      assert.strictEqual(result.status, status, `score ${score}`);
      assert.strictEqual(result.matcher, 'ai');
      assert.strictEqual(result.aiAttempted, true);
      assert.strictEqual(result.aiFallback, undefined);
      assert.strictEqual(result.aiError, undefined);
      assert.strictEqual(result.signals.semanticScore, score);
      assert.strictEqual(result.signals.semanticVerdict, verdict);
    }
  });

  it('keeps MATCH_STRONG and still audits operator text with GO-AI on deterministic trace overlap', async () => {
    const linked = analysis({
      trackingIds: [{ traceId: 'r1', timestamp: NOW, errorDetail: 'Timeout Lambda confermato' }],
    });
    const matcher = semanticMatcher(90, 'equivalent', 'Stessa diagnosi.');

    const result = await matchAnalysisAi(OUTPUT, HIT, linked, NOW, aiOptions(matcher));

    assert.strictEqual(result.status, 'MATCH_STRONG');
    assert.strictEqual(result.matcher, 'deterministic+ai');
    assert.strictEqual(result.aiAttempted, true);
    assert.strictEqual(matcher.calls, 1);
    assert.deepStrictEqual(result.signals.traceIdOverlap, ['r1']);
    assert.strictEqual(result.signals.semanticScore, 90);
    assert.strictEqual(result.semanticExplanation, 'Stessa diagnosi.');
  });

  it('keeps MATCH_STRONG and records a conflicting AI audit when the analysis mentions the matched case id', async () => {
    const linked = analysis({ errorDetails: 'Caso lambda-timeout confermato da Watchtower.' });
    const matcher = semanticMatcher(20, 'conflicting');

    const result = await matchAnalysisAi(OUTPUT, HIT, linked, NOW, aiOptions(matcher));

    assert.strictEqual(result.status, 'MATCH_STRONG');
    assert.strictEqual(result.matcher, 'deterministic+ai');
    assert.strictEqual(result.aiAttempted, true);
    assert.strictEqual(matcher.calls, 1);
    assert.strictEqual(result.signals.knownErrorCodeMentioned, true);
    assert.strictEqual(result.signals.semanticScore, 20);
    assert.strictEqual(result.signals.semanticVerdict, 'conflicting');
    assert.match(result.reasons.join('\n'), /possibile divergenza/);
  });

  it('keeps MATCH_STRONG visible when the AI audit fails on a deterministic match', async () => {
    const linked = analysis({
      trackingIds: [{ traceId: 'r1', timestamp: NOW, errorDetail: 'Timeout Lambda confermato' }],
    });

    const result = await matchAnalysisAi(OUTPUT, HIT, linked, NOW, aiOptions(failingMatcher()));

    assert.strictEqual(result.status, 'MATCH_STRONG');
    assert.strictEqual(result.matcher, 'deterministic');
    assert.strictEqual(result.aiAttempted, true);
    assert.strictEqual(result.aiFallback, undefined);
    assert.strictEqual(result.aiError, 'Bedrock unavailable');
    assert.match(result.reasons.join('\n'), /MATCH_STRONG mantenuto/);
  });

  it('falls back to lexical comparison when GO-AI fails and fallback is enabled', async () => {
    const linked = analysis({ errorDetails: 'Timeout runtime della Lambda' });

    const result = await matchAnalysisAi(OUTPUT, HIT, linked, NOW, aiOptions(failingMatcher()));

    assert.strictEqual(result.matcher, 'lexical');
    assert.strictEqual(result.aiAttempted, true);
    assert.strictEqual(result.aiFallback, true);
    assert.strictEqual(result.aiError, 'Bedrock unavailable');
    assert.match(result.reasons.join('\n'), /fallback lessicale/);
  });

  it('agrees with the lexical matcher on every comparison the AI never ran on', async () => {
    const skipped = [
      analysis({ status: 'IN_PROGRESS' }),
      analysis({
        analysisType: 'IGNORABLE',
        ignoreReasonCode: 'MAINTENANCE',
        ignoreReason: {
          code: 'MAINTENANCE',
          description: null,
          detailsSchema: null,
          label: 'Manutenzione',
          sortOrder: 2,
        },
      }),
    ];

    for (const linked of skipped) {
      const lexical = matchAnalysis(OUTPUT, HIT, linked, NOW, { includeIgnorable: false, includeIncomplete: false });
      const withAi = await matchAnalysisAi(OUTPUT, HIT, linked, NOW, aiOptions(neverInvoked()));

      assert.strictEqual(withAi.matcher, 'lexical');
      assert.deepStrictEqual(withAi, { ...lexical, aiAttempted: false });
    }
  });
});
