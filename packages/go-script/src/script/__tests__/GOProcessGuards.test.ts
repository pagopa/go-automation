import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { installProcessGuards, resetProcessGuardsForTesting, serializeError } from '../GOProcessGuards.js';
import { GOScript } from '../GOScript.js';

describe('GOProcessGuards.serializeError', () => {
  it('keeps name (custom subclasses included), message and stack for Error instances', () => {
    class CustomError extends Error {
      override readonly name = 'CustomError';
    }

    for (const [error, name] of [
      [new TypeError('boom'), 'TypeError'],
      [new CustomError('boom'), 'CustomError'],
    ] as const) {
      const result = serializeError(error);
      assert.strictEqual(result['name'], name);
      assert.strictEqual(result['message'], 'boom');
      assert.strictEqual(typeof result['stack'], 'string');
    }
  });

  it('wraps non-Error values under "value", rendering null, undefined and BigInt literally', () => {
    const cases: ReadonlyArray<readonly [unknown, string]> = [
      ['plain string', 'plain string'],
      [42, '42'],
      [true, 'true'],
      [null, 'null'],
      [undefined, 'undefined'],
      // Plain JSON.stringify throws on a BigInt.
      [123n, '123'],
    ];

    for (const [value, expected] of cases) {
      assert.deepStrictEqual(serializeError(value), { value: expected });
    }
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
    script.createLambdaHandler(async () => {
      await Promise.resolve();
    });
    const after = process.listenerCount('uncaughtException');
    assert.strictEqual(after, before, 'createLambdaHandler must not add a guard listener under test');
  });
});

describe('GOProcessGuards.resetProcessGuardsForTesting', () => {
  it('removes installed listeners so reset and reinstall do not accumulate handlers', () => {
    interface ListenerCounts {
      readonly beforeExit: number;
      readonly uncaughtException: number;
      readonly unhandledRejection: number;
      readonly warning: number;
    }

    const getListenerCounts = (): ListenerCounts => ({
      beforeExit: process.listenerCount('beforeExit'),
      uncaughtException: process.listenerCount('uncaughtException'),
      unhandledRejection: process.listenerCount('unhandledRejection'),
      warning: process.listenerCount('warning'),
    });

    resetProcessGuardsForTesting();
    const baseline = getListenerCounts();

    try {
      installProcessGuards({ exitOnFatal: false, includeBeforeExit: true });
      assert.deepStrictEqual(getListenerCounts(), {
        beforeExit: baseline.beforeExit + 1,
        uncaughtException: baseline.uncaughtException + 1,
        unhandledRejection: baseline.unhandledRejection + 1,
        warning: baseline.warning + 1,
      });

      resetProcessGuardsForTesting();
      assert.deepStrictEqual(getListenerCounts(), baseline);

      installProcessGuards({ exitOnFatal: false, includeBeforeExit: true });
      assert.deepStrictEqual(getListenerCounts(), {
        beforeExit: baseline.beforeExit + 1,
        uncaughtException: baseline.uncaughtException + 1,
        unhandledRejection: baseline.unhandledRejection + 1,
        warning: baseline.warning + 1,
      });
    } finally {
      resetProcessGuardsForTesting();
    }

    assert.deepStrictEqual(getListenerCounts(), baseline);
  });
});
