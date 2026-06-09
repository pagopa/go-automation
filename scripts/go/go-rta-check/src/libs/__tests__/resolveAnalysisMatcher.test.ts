import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { formatAnalysisMatcherLabel, resolveAnalysisMatcher } from '../resolveAnalysisMatcher.js';

describe('resolveAnalysisMatcher', () => {
  it('defaults to the AI matcher with semantic threshold 70', () => {
    const resolved = resolveAnalysisMatcher({});

    assert.strictEqual(resolved.kind, 'ai');
    assert.strictEqual(resolved.semanticThreshold, 70);
    assert.match(formatAnalysisMatcherLabel(resolved), /Bedrock diretto/);
  });

  it('can force the lexical matcher', () => {
    const resolved = resolveAnalysisMatcher({ analysisMatcher: 'lexical' });

    assert.strictEqual(resolved.kind, 'lexical');
    assert.strictEqual(resolved.semanticThreshold, undefined);
    assert.strictEqual(formatAnalysisMatcherLabel(resolved), 'lexical');
  });

  it('rejects invalid semantic thresholds', () => {
    assert.throws(() => resolveAnalysisMatcher({ goAiSemanticThreshold: 101 }), /0\.\.100/);
  });

  it('uses the standard awsProfile configuration for the AI matcher', () => {
    const resolved = resolveAnalysisMatcher({ awsProfile: 'generic-profile' });

    assert.strictEqual(resolved.kind, 'ai');
    assert.strictEqual(resolved.semanticThreshold, 70);
  });
});
