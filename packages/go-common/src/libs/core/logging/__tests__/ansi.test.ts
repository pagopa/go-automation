import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { consoleColorsEnabled, stripAnsi } from '../ansi.js';

type EnvFn = () => void;

describe('stripAnsi', () => {
  it('removes a simple color sequence', () => {
    assert.strictEqual(stripAnsi('\x1b[37mhello\x1b[0m'), 'hello');
  });

  it('removes compound/multiple sequences', () => {
    assert.strictEqual(stripAnsi('\x1b[1m\x1b[34mx\x1b[0m y \x1b[32mz\x1b[0m'), 'x y z');
  });

  it('leaves plain text unchanged', () => {
    assert.strictEqual(stripAnsi('plain text'), 'plain text');
  });
});

describe('consoleColorsEnabled', () => {
  function withEnv(vars: Record<string, string | undefined>, fn: EnvFn): void {
    const keys = ['NO_COLOR', 'FORCE_COLOR'];
    const previous = new Map(keys.map((k) => [k, process.env[k]]));
    for (const key of keys) {
      delete process.env[key];
    }
    for (const [key, value] of Object.entries(vars)) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
    try {
      fn();
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  }

  it('is disabled when NO_COLOR is set (even with FORCE_COLOR)', () => {
    withEnv({ NO_COLOR: '1', FORCE_COLOR: '1' }, () => {
      assert.strictEqual(consoleColorsEnabled(), false);
    });
  });

  it('is enabled when FORCE_COLOR is truthy', () => {
    withEnv({ FORCE_COLOR: '1' }, () => {
      assert.strictEqual(consoleColorsEnabled(), true);
    });
  });

  it('is disabled when FORCE_COLOR is 0', () => {
    withEnv({ FORCE_COLOR: '0' }, () => {
      assert.strictEqual(consoleColorsEnabled(), false);
    });
  });
});
