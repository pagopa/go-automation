import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import stringWidth from 'string-width';

import { expandTabs } from '../expandTabs.js';

describe('expandTabs', () => {
  it('replaces every tab with spaces', () => {
    assert.strictEqual(expandTabs('a\tb\tc'), 'a  b  c');
  });

  it('expands tabs on every line of a multi-line cell', () => {
    assert.strictEqual(expandTabs('at Foo.bar\n\tat Baz.qux'), 'at Foo.bar\n  at Baz.qux');
  });

  it('leaves text without tabs untouched', () => {
    assert.strictEqual(expandTabs('nothing to expand'), 'nothing to expand');
    assert.strictEqual(expandTabs(''), '');
  });

  it('makes the measured width match the rendered one', () => {
    // string-width counts a tab as zero columns while a terminal advances it,
    // so an un-expanded tab renders wider than the table computed.
    assert.strictEqual(stringWidth('\tat Foo.bar'), 'at Foo.bar'.length);
    assert.strictEqual(stringWidth(expandTabs('\tat Foo.bar')), 'at Foo.bar'.length + 2);
  });
});
