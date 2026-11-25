import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { colorize } from '../tableRenderer/colorize.js';

describe('colorize', () => {
  it('wraps text in the color code plus RESET, or returns it unchanged without color', () => {
    assert.strictEqual(colorize('hello', undefined), 'hello');
    assert.strictEqual(colorize('hi', 'red'), '\x1b[31mhi\x1b[0m');
    assert.strictEqual(colorize('hi', 'cyan'), '\x1b[36mhi\x1b[0m');
    assert.strictEqual(colorize('', 'blue'), '\x1b[34m\x1b[0m');
  });
});
