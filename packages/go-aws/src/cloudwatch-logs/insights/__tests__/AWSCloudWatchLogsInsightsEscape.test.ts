import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { escapeLogsInsightsRegexLiteral, escapeLogsInsightsString } from '../AWSCloudWatchLogsInsightsEscape.js';

describe('escapeLogsInsightsString', () => {
  it('escapes the characters that would terminate the literal and drops NUL, which Insights rejects', () => {
    for (const [value, expected] of [
      ['abc-123', 'abc-123'],
      ['say "hi"', 'say \\"hi\\"'],
      ['a\\b', 'a\\\\b'],
      ['a\0b', 'ab'],
    ] as const) {
      assert.strictEqual(escapeLogsInsightsString(value), expected, value);
    }
  });
});

describe('escapeLogsInsightsRegexLiteral', () => {
  it('escapes every metacharacter so the value matches literally', () => {
    // A service name carries hyphens and dots; unescaped they would widen
    // what the filter matches instead of pinning it.
    for (const [value, expected] of [
      ['interopBff', 'interopBff'],
      ['', ''],
      ['interop-be-bff', 'interop\\-be\\-bff'],
      ['a.b', 'a\\.b'],
      ['a/b', 'a\\/b'],
      ['a(b)c*', 'a\\(b\\)c\\*'],
    ] as const) {
      assert.strictEqual(escapeLogsInsightsRegexLiteral(value), expected, value);
    }
  });
});
