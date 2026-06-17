import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { serializeError } from '../GOProcessGuards.js';
import { GOScript } from '../GOScript.js';

describe('GOProcessGuards.serializeError', () => {
  it('keeps name, message and stack for Error instances', () => {
    const err = new TypeError('boom');
    const result = serializeError(err);
    assert.strictEqual(result['name'], 'TypeError');
    assert.strictEqual(result['message'], 'boom');
    assert.strictEqual(typeof result['stack'], 'string');
  });

  it('preserves a custom Error subclass name', () => {
    class CustomError extends Error {
      override readonly name = 'CustomError';
    }
    const result = serializeError(new CustomError('nope'));
    assert.strictEqual(result['name'], 'CustomError');
    assert.strictEqual(result['message'], 'nope');
  });

  it('wraps non-Error values under "value"', () => {
    assert.deepStrictEqual(serializeError('plain string'), { value: 'plain string' });
    assert.deepStrictEqual(serializeError(42), { value: '42' });
    assert.deepStrictEqual(serializeError(true), { value: 'true' });
  });

  it('renders null and undefined literally (not empty string)', () => {
    assert.deepStrictEqual(serializeError(null), { value: 'null' });
    assert.deepStrictEqual(serializeError(undefined), { value: 'undefined' });
  });

  it('handles BigInt that plain JSON.stringify would throw on', () => {
    assert.deepStrictEqual(serializeError(123n), { value: '123' });
  });

  it('handles circular references without throwing', () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular['self'] = circular;
    const result = serializeError(circular);
    assert.match(result['value'] as string, /\[Circular\]/);
  });
});

describe('GOScript process guards test gate', () => {
  it('does not register fault guards when running under the test runner', () => {
    // The whole suite runs under `node --test`, so guards must stay suppressed:
    // a guard's process.exit(1) would otherwise kill the test runner.
    const before = process.listenerCount('uncaughtException');
    const script = new GOScript({
      metadata: { name: 'guard gate probe', version: '1.0.0', description: 'gate probe', authors: ['test'] },
      config: { parameters: [] },
    });
    // Guard installation would happen here if the test gate were broken.
    script.createLambdaHandler(async () => undefined);
    const after = process.listenerCount('uncaughtException');
    assert.strictEqual(after, before, 'createLambdaHandler must not add a guard listener under test');
  });
});
