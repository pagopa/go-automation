import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOYAMLParser, isYAMLObject } from '../GOYAMLParser.js';
import { useTempDir } from '../../__tests__/helpers/createTempDir.js';

describe('GOYAMLParser', () => {
  const tmp = useTempDir('go-yaml-parser-');

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

  it('skips dangerous keys while merging YAML files', async () => {
    const baseFile = await tmp.write(
      'base.yaml',
      [
        'safe:',
        '  value: base',
        '  nested: keep',
        '  prototype: blocked',
        '  items:',
        '    - name: ok',
        '      constructor: blocked',
        'constructor: blocked',
        '__proto__: blocked',
      ].join('\n'),
    );
    const overrideFile = await tmp.write(
      'override.yaml',
      [
        'safe:',
        '  value: override',
        '  __proto__: blocked',
        'prototype: blocked',
        'toString:',
        '  value: own-value',
      ].join('\n'),
    );

    const merged = GOYAMLParser.parseFiles([baseFile, overrideFile]);

    assert.deepStrictEqual(merged, {
      safe: {
        value: 'override',
        nested: 'keep',
        items: [{ name: 'ok' }],
      },
      toString: {
        value: 'own-value',
      },
    });
    assert.strictEqual(Object.prototype.hasOwnProperty.call(merged, 'constructor'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(merged, 'prototype'), false);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(merged, 'toString'), true);
  });
});
