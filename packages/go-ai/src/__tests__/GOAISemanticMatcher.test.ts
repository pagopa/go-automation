import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { GOAISemanticMatcher, parseGOSemanticMatchResult } from '../GOAISemanticMatcher.js';
import { GOAIHat, type GOAIInvoker, type GOAIRequest, type GOAIResponse } from '../types/index.js';

class RecordingInvoker implements GOAIInvoker {
  readonly requests: GOAIRequest[] = [];

  async invoke(req: GOAIRequest): Promise<GOAIResponse> {
    await Promise.resolve();
    this.requests.push(req);
    return {
      output: '```json\n{"score":88,"explanation":"same root cause","verdict":"equivalent"}\n```',
      model: 'test-model',
      inputTokens: 1,
      outputTokens: 1,
      hat: req.hat,
    };
  }
}

describe('parseGOSemanticMatchResult', () => {
  it('normalizes valid semantic-match JSON output', () => {
    assert.deepStrictEqual(
      parseGOSemanticMatchResult('{"score":"42","explanation":"different","verdict":"conflicting"}'),
      {
        score: 42,
        explanation: 'different',
        verdict: 'conflicting',
      },
    );
  });

  it('rejects invalid semantic scores', () => {
    assert.throws(() => parseGOSemanticMatchResult('{"score":101}'), /Invalid semantic-match score/);
  });
});

describe('GOAISemanticMatcher', () => {
  it('invokes the semantic-match hat and parses the response', async () => {
    const invoker = new RecordingInvoker();
    const matcher = new GOAISemanticMatcher({ client: invoker, maxTokens: 500, temperature: 0 });

    const result = await matcher.match({ a: 'runbook timeout', b: 'operator saw timeout' });

    assert.deepStrictEqual(result, {
      score: 88,
      explanation: 'same root cause',
      verdict: 'equivalent',
    });
    assert.strictEqual(invoker.requests.length, 1);
    assert.deepStrictEqual(invoker.requests[0], {
      hat: GOAIHat.SemanticMatch,
      input: JSON.stringify({ a: 'runbook timeout', b: 'operator saw timeout' }),
      maxTokens: 500,
      temperature: 0,
    });
  });
});
