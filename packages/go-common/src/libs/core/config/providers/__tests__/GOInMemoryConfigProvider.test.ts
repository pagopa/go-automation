import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOSecretsSpecifierFactory } from '../../GOSecretsSpecifier.js';
import { GOInMemoryConfigProvider } from '../GOInMemoryConfigProvider.js';

describe('GOInMemoryConfigProvider', () => {
  it('starts empty with the default name when no options are provided', () => {
    const provider = new GOInMemoryConfigProvider();

    assert.strictEqual(provider.getName(), 'InMemory');
    assert.deepStrictEqual(provider.getAllKeys(), []);
    assert.strictEqual(provider.getValue('missing'), undefined);
    assert.strictEqual(provider.hasKey('missing'), false);
    assert.strictEqual(provider.isSecret('missing'), false);
  });

  it('stores initial values and redacts configured secrets', () => {
    const provider = new GOInMemoryConfigProvider({
      name: 'Defaults',
      values: {
        name: 'demo',
        tokens: ['a', 'b'],
      },
      secretsSpecifier: GOSecretsSpecifierFactory.specific(['tokens']),
    });

    assert.strictEqual(provider.getName(), 'Defaults');
    assert.strictEqual(provider.getValue('name'), 'demo');
    assert.deepStrictEqual(provider.getValue('tokens'), ['a', 'b']);
    assert.strictEqual(provider.isSecret('tokens'), true);
    assert.strictEqual(provider.getDisplayValue('tokens'), '[REDACTED (2 items)]');
  });

  it('sets, removes and clears values', () => {
    const provider = new GOInMemoryConfigProvider();

    provider.setValue('single', 'value');
    provider.setValues({
      multi: ['one', 'two'],
      other: 'keep',
    });

    assert.strictEqual(provider.getValue('single'), 'value');
    assert.deepStrictEqual(provider.getValue('multi'), ['one', 'two']);
    assert.strictEqual(provider.getValue('other'), 'keep');

    provider.removeValue('single');

    assert.strictEqual(provider.hasKey('single'), false);
    assert.deepStrictEqual(provider.getAllKeys().sort(), ['multi', 'other']);

    provider.clear();

    assert.deepStrictEqual(provider.getAllKeys(), []);
  });
});
