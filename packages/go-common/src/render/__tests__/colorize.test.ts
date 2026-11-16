import { describe, it } from 'node:test';
import assert from 'node:assert';

import { colorize } from '../tableRenderer/colorize.js';

describe('colorize', () => {
  it('returns input unchanged when color is undefined', () => {
    assert.strictEqual(colorize('hello', undefined), 'hello');
  });

  it('wraps text in red ANSI codes', () => {
    assert.strictEqual(colorize('hi', 'red'), '\x1b[31mhi\x1b[0m');
  });

  it('wraps text in cyan ANSI codes', () => {
    assert.strictEqual(colorize('hi', 'cyan'), '\x1b[36mhi\x1b[0m');
  });

  it('always appends RESET sequence at the end', () => {
    const out = colorize('any', 'green');
    assert.ok(out.endsWith('\x1b[0m'));
  });

  it('handles empty string', () => {
    assert.strictEqual(colorize('', 'blue'), '\x1b[34m\x1b[0m');
  });
});
