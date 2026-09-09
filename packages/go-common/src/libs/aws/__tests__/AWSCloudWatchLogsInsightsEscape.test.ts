import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { escapeLogsInsightsRegexLiteral, escapeLogsInsightsString } from '../AWSCloudWatchLogsInsightsEscape.js';

describe('escapeLogsInsightsString', () => {
  it('leaves an ordinary value untouched', () => {
    assert.strictEqual(escapeLogsInsightsString('abc-123'), 'abc-123');
  });

  it('escapes the characters that would terminate the literal', () => {
    assert.strictEqual(escapeLogsInsightsString('say "hi"'), 'say \\"hi\\"');
    assert.strictEqual(escapeLogsInsightsString('a\\b'), 'a\\\\b');
  });

  it('drops NUL, which Insights rejects', () => {
    assert.strictEqual(escapeLogsInsightsString('a\0b'), 'ab');
  });
});

describe('escapeLogsInsightsRegexLiteral', () => {
  it('leaves a value with no metacharacters untouched', () => {
    assert.strictEqual(escapeLogsInsightsRegexLiteral('interopBff'), 'interopBff');
  });

  it('escapes every metacharacter so the value matches literally', () => {
    // A service name carries hyphens and dots; unescaped they would widen
    // what the filter matches instead of pinning it.
    assert.strictEqual(escapeLogsInsightsRegexLiteral('interop-be-bff'), 'interop\\-be\\-bff');
    assert.strictEqual(escapeLogsInsightsRegexLiteral('a.b'), 'a\\.b');
    assert.strictEqual(escapeLogsInsightsRegexLiteral('a/b'), 'a\\/b');
    assert.strictEqual(escapeLogsInsightsRegexLiteral('a(b)c*'), 'a\\(b\\)c\\*');
  });

  it('handles an empty value', () => {
    assert.strictEqual(escapeLogsInsightsRegexLiteral(''), '');
  });
});
