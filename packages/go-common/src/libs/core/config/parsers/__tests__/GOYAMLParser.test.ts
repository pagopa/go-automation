import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOYAMLParser, isYAMLObject } from '../GOYAMLParser.js';

describe('GOYAMLParser', () => {
  it('does not materialize unsafe JavaScript YAML tags', () => {
    const parsed = GOYAMLParser.parseContent(
      ['fn: !!js/function >', '  function () { return 1; }', 're: !!js/regexp /abc/g'].join('\n'),
    );

    assert.ok(isYAMLObject(parsed));
    assert.strictEqual(typeof parsed['fn'], 'string');
    assert.strictEqual(typeof parsed['re'], 'string');
    assert.ok(!(parsed['fn'] instanceof Function));
    assert.ok(!(parsed['re'] instanceof RegExp));
  });

  it('rejects duplicate mapping keys', () => {
    assert.throws(() => GOYAMLParser.parseContent(['a: 1', 'a: 2'].join('\n')), /Map keys must be unique/);
  });
});
