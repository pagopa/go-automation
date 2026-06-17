import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { redactSensitiveLogText, redactSensitiveLogValue } from '../GOSensitiveLogRedactor.js';

describe('GOSensitiveLogRedactor', () => {
  it('redacts common secret assignments and authorization headers from text', () => {
    const text =
      'Authorization: Bearer abc.def.ghi password=secret apiKey="key-123" url=https://user:pass@example.test/path';

    const redacted = redactSensitiveLogText(text);

    assert.ok(!redacted.includes('abc.def.ghi'));
    assert.ok(!redacted.includes('secret'));
    assert.ok(!redacted.includes('key-123'));
    assert.ok(!redacted.includes('user:pass'));
    assert.match(redacted, /Authorization: Bearer <redacted>/u);
    assert.match(redacted, /password=<redacted>/u);
    assert.match(redacted, /apiKey=<redacted>/u);
    assert.match(redacted, /https:\/\/<redacted>@example\.test\/path/u);
  });

  it('redacts JSON-like fields and standalone token formats from text', () => {
    const redacted = redactSensitiveLogText(
      '{"accessToken":"eyJheader.eyJpayload.signature","client_secret":"plain"} xoxb-123456-secret AKIA1234567890ABCDEF',
    );

    assert.ok(!redacted.includes('eyJheader.eyJpayload.signature'));
    assert.ok(!redacted.includes('plain'));
    assert.ok(!redacted.includes('xoxb-123456-secret'));
    assert.ok(!redacted.includes('AKIA1234567890ABCDEF'));
    assert.match(redacted, /"accessToken":"\[REDACTED\]"/u);
    assert.match(redacted, /"client_secret":"\[REDACTED\]"/u);
  });

  it('redacts sensitive structured keys and nested string values without mutating the original', () => {
    const original = {
      nested: {
        message: 'failed with Authorization=Bearer nested-secret',
        token: 'raw-token',
      },
      items: ['password=abc', { apiKey: 'key' }],
      safe: 'visible',
    };

    const redacted = redactSensitiveLogValue(original);

    assert.deepStrictEqual(redacted, {
      nested: {
        message: 'failed with Authorization=Bearer <redacted>',
        token: '[REDACTED]',
      },
      items: ['password=<redacted>', { apiKey: '[REDACTED]' }],
      safe: 'visible',
    });
    assert.strictEqual(original.nested.token, 'raw-token');
  });

  it('handles circular structured payloads', () => {
    const payload: Record<string, unknown> = { token: 'secret' };
    payload['self'] = payload;

    assert.deepStrictEqual(redactSensitiveLogValue(payload), {
      self: '[Circular]',
      token: '[REDACTED]',
    });
  });
});
