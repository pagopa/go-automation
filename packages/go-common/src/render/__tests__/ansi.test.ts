import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { consoleColorsEnabled, stripAnsi } from '../ansi.js';
import { withEnv } from '../../__tests__/helpers/withEnv.js';

describe('stripAnsi', () => {
  it('removes simple and compound color sequences, leaving plain text unchanged', () => {
    assert.strictEqual(stripAnsi('\x1b[37mhello\x1b[0m'), 'hello');
    assert.strictEqual(stripAnsi('\x1b[1m\x1b[34mx\x1b[0m y \x1b[32mz\x1b[0m'), 'x y z');
    assert.strictEqual(stripAnsi('plain text'), 'plain text');
  });
});

describe('consoleColorsEnabled', () => {
  it('honours NO_COLOR over FORCE_COLOR, and FORCE_COLOR=0', () => {
    const cases: ReadonlyArray<readonly [env: Record<string, string | undefined>, expected: boolean]> = [
      [{ NO_COLOR: '1', FORCE_COLOR: '1' }, false],
      [{ NO_COLOR: undefined, FORCE_COLOR: '1' }, true],
      [{ NO_COLOR: undefined, FORCE_COLOR: '0' }, false],
    ];
    for (const [env, expected] of cases) {
      assert.strictEqual(
        withEnv(env, () => consoleColorsEnabled()),
        expected,
        JSON.stringify(env),
      );
    }
  });
});
