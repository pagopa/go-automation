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

const PAIR = { a: 'runbook timeout', b: 'operator saw timeout' } as const;

describe('parseGOSemanticMatchResult', () => {
  it('normalizes valid semantic-match JSON output', () => {
    assert.deepStrictEqual(
      parseGOSemanticMatchResult('{"score":"42","explanation":"different","verdict":"conflicting"}'),
      { score: 42, explanation: 'different', verdict: 'conflicting' },
    );
  });

  it('rejects invalid semantic scores', () => {
    assert.throws(() => parseGOSemanticMatchResult('{"score":101}'), /Invalid semantic-match score/);
  });

  it('normalizes missing verdicts with the configured threshold', () => {
    assert.deepStrictEqual(parseGOSemanticMatchResult('{"score":65,"explanation":"above custom threshold"}', 60), {
      score: 65,
      explanation: 'above custom threshold',
      verdict: 'equivalent',
    });
  });
});

describe('GOAISemanticMatcher', () => {
  it('invokes the semantic-match hat with the default threshold and parses the response', async () => {
    const invoker = new RecordingInvoker();
    const matcher = new GOAISemanticMatcher({ client: invoker, maxTokens: 500, temperature: 0 });

    const result = await matcher.match(PAIR);

    assert.deepStrictEqual(result, { score: 88, explanation: 'same root cause', verdict: 'equivalent' });
    assert.deepStrictEqual(invoker.requests, [
      {
        hat: GOAIHat.SemanticMatch,
        input: JSON.stringify({ ...PAIR, threshold: 70 }),
        maxTokens: 500,
        temperature: 0,
      },
    ]);
  });

  it('passes a configured threshold to the semantic-match hat', async () => {
    const invoker = new RecordingInvoker();
    const matcher = new GOAISemanticMatcher({ client: invoker, threshold: 85 });

    await matcher.match(PAIR);

    assert.deepStrictEqual(JSON.parse(invoker.requests[0]?.input ?? '{}'), { ...PAIR, threshold: 85 });
  });
});
