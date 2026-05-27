import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach } from 'node:test';
import { describe, it } from 'node:test';

import { GOYAMLParser, isYAMLObject } from '../GOYAMLParser.js';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function writeTempYamlFile(fileName: string, content: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'go-yaml-parser-'));
  tempRoots.push(root);
  const filePath = path.join(root, fileName);
  fs.writeFileSync(filePath, content);
  return filePath;
}

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

  it('skips dangerous keys while merging YAML files', () => {
    const baseFile = writeTempYamlFile(
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
    const overrideFile = writeTempYamlFile(
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
