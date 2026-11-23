import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { escapeInsightsRegex, traceIdsInsightsPattern } from '../insightsRegex.js';
import { traceIdForms } from '../../parsing/traceIds/traceIdentity.js';

const XRAY = '1-6ade89e7-1881f1cf24c5edf61cb105cf';
const VALUES = [
  XRAY,
  '1-6789ABCD-0123456789abcdef01234567',
  `Root=${XRAY};Parent=53995c3f42cd8ad8;Sampled=1`,
  'a.b(c)/d',
];

/** Whether one `like` per form, as a substring, finds the message: what the reads did before the regex. */
function likeFinds(message: string, values: ReadonlyArray<string>): boolean {
  return values.flatMap((value) => traceIdForms(value)).some((form) => message.includes(form));
}

describe('insightsRegex', () => {
  it('escapes every special character of a regex, the delimiter included', () => {
    assert.strictEqual(escapeInsightsRegex('a.b*c/d(e)|f'), 'a\\.b\\*c\\/d\\(e\\)\\|f');
    assert.ok(new RegExp(escapeInsightsRegex('a.b*c/d(e)|f'), 'u').test('x a.b*c/d(e)|f y'));
  });

  it('finds the same messages as one like per form, for every kind of value', () => {
    const regex = new RegExp(traceIdsInsightsPattern(VALUES), 'u');
    const messages = [
      `call ${XRAY} ok`,
      'trace 6ade89e71881f1cf24c5edf61cb105cf',
      'trace 1-6789abcd-0123456789abcdef01234567',
      'trace 6789abcd0123456789abcdef01234567',
      'mixed 1-6789ABCD-0123456789abcdef01234567',
      `header Root=${XRAY};Parent=53995c3f42cd8ad8;Sampled=1`,
      'opaque a.b(c)/d here',
      'opaque aXb(c)/d here',
      'trace 1-00000000-111111111111111111111111',
      '6ade89e7-1881f1cf24c5edf61cb105cf without the version',
    ];
    for (const message of messages) {
      assert.strictEqual(regex.test(message), likeFinds(message, VALUES), message);
    }
  });

  it('writes every form once, readable in the query', () => {
    assert.strictEqual(traceIdsInsightsPattern([XRAY, XRAY]), `${XRAY}|6ade89e71881f1cf24c5edf61cb105cf`);
  });
});
