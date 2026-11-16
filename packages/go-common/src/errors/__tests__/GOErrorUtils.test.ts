import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  errorMessageContains,
  getErrorMessage,
  getErrorStack,
  hasErrorName,
  toError,
  wrapError,
} from '../GOErrorUtils.js';

describe('GOErrorUtils', () => {
  it('extracts messages from common error shapes', () => {
    const nativeError = new Error('native message');

    assert.strictEqual(getErrorMessage(nativeError), 'native message');
    assert.strictEqual(getErrorMessage('plain string'), 'plain string');
    assert.strictEqual(getErrorMessage(null), 'null');
    assert.strictEqual(getErrorMessage(undefined), 'undefined');
    assert.strictEqual(getErrorMessage({ message: 'object message' }), 'object message');
  });

  it('falls back to custom toString and JSON serialization when needed', () => {
    const customToString = {
      message: 404,
      toString: () => 'custom stringified message',
    };
    const plainObject = { code: 'E_GENERIC', detail: 'serialized' };
    const circular: { self?: unknown } = {};
    circular.self = circular;

    assert.strictEqual(getErrorMessage(customToString), 'custom stringified message');
    assert.strictEqual(getErrorMessage(plainObject), JSON.stringify(plainObject));
    assert.strictEqual(getErrorMessage(circular), '[Unknown error]');
  });

  it('converts unknown values to Error instances', () => {
    const error = new TypeError('already an error');

    assert.strictEqual(toError(error), error);

    const wrappedString = toError('string failure');
    assert.ok(wrappedString instanceof Error);
    assert.strictEqual(wrappedString.message, 'string failure');
  });

  it('wraps errors with context and preserves original stack when available', () => {
    const original = new Error('disk full');
    original.stack = 'Error: disk full\n    at original';

    const wrapped = wrapError(original, 'Failed to save file');
    assert.strictEqual(wrapped.message, 'Failed to save file: disk full');
    assert.strictEqual(
      wrapped.stack,
      'Failed to save file: disk full\n    [Caused by]\nError: disk full\n    at original',
    );

    const wrappedUnknown = wrapError({ message: 'from object' }, 'Context');
    assert.strictEqual(wrappedUnknown.message, 'Context: from object');
  });

  it('returns stack when available and supports error name/message matching helpers', () => {
    const error = new TypeError('Connection REFUSED');
    error.stack = 'TypeError: Connection REFUSED\n    at test';

    assert.strictEqual(getErrorStack(error), 'TypeError: Connection REFUSED\n    at test');
    assert.strictEqual(getErrorStack('fallback string'), 'fallback string');

    assert.strictEqual(hasErrorName(error, 'TypeError'), true);
    assert.strictEqual(hasErrorName(error, 'AbortError'), false);

    assert.strictEqual(errorMessageContains(error, 'refused'), true);
    assert.strictEqual(errorMessageContains(error, 'timeout'), false);
    assert.strictEqual(errorMessageContains({ message: 'Database DOWN' }, 'down'), true);
  });
});
