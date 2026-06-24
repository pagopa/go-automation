import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GOSecretsSpecifierFactory } from '../../GOSecretsSpecifier.js';
import { GOCommandLineConfigProvider } from '../GOCommandLineConfigProvider.js';

describe('GOCommandLineConfigProvider', () => {
  it('parses explicit arguments and exposes normalized and original keys', () => {
    const provider = new GOCommandLineConfigProvider({
      arguments: [
        '--http-timeout=30',
        '--feature-enabled',
        '--include',
        'one,two',
        '--include',
        'three',
        '-s',
        'short',
      ],
    });

    assert.strictEqual(provider.getName(), 'CommandLine');
    assert.strictEqual(provider.getValue('http.timeout'), '30');
    assert.strictEqual(provider.getValue('http-timeout'), '30');
    assert.strictEqual(provider.hasKey('http.timeout'), true);
    assert.strictEqual(provider.hasKey('http-timeout'), true);
    assert.strictEqual(provider.getValue('feature.enabled'), 'true');
    assert.deepStrictEqual(provider.getValue('include'), ['one', 'two', 'three']);
    assert.strictEqual(provider.getValue('s'), 'short');
    assert.strictEqual(provider.getValue('missing'), undefined);
    assert.strictEqual(provider.hasKey('missing'), false);
    assert.deepStrictEqual(provider.getRawArguments(), [
      '--http-timeout=30',
      '--feature-enabled',
      '--include',
      'one,two',
      '--include',
      'three',
      '-s',
      'short',
    ]);
    assert.deepStrictEqual(provider.getProvidedFlags(), ['http-timeout', 'feature-enabled', 'include', 's']);
  });

  it('uses schema hints for booleans and arrays', () => {
    const provider = new GOCommandLineConfigProvider({
      arguments: ['--dry-run=false', '--tags', 'alpha,beta', '--tags', 'gamma', '--name', 'demo'],
      schema: {
        booleanFlags: ['dry-run'],
        arrayFlags: ['tags'],
      },
    });

    assert.strictEqual(provider.getValue('dry.run'), 'false');
    assert.deepStrictEqual(provider.getValue('tags'), ['alpha', 'beta', 'gamma']);
    assert.strictEqual(provider.getValue('name'), 'demo');
  });

  it('resolves full kebab-case flags for camelCase parameter names', () => {
    const provider = new GOCommandLineConfigProvider({
      arguments: ['--go-ai-semantic-threshold', '80', '--go-ai-fallback-to-lexical=false'],
    });

    assert.strictEqual(provider.hasKey('go.ai.semanticThreshold'), true);
    assert.strictEqual(provider.getValue('go.ai.semanticThreshold'), '80');
    assert.strictEqual(provider.getValue('go.ai.semantic.threshold'), '80');
    assert.strictEqual(provider.hasKey('go.ai.fallbackToLexical'), true);
    assert.strictEqual(provider.getValue('go.ai.fallbackToLexical'), 'false');
  });

  it('redacts configured secrets in display values', () => {
    const provider = new GOCommandLineConfigProvider({
      arguments: ['--api-token', 'super-secret', '--name', 'demo'],
      secretsSpecifier: GOSecretsSpecifierFactory.specific(['api.token']),
    });

    assert.strictEqual(provider.isSecret('api.token'), true);
    assert.strictEqual(provider.isSecret('name'), false);
    assert.strictEqual(provider.getDisplayValue('api.token'), '[REDACTED (12 chars)]');
    assert.strictEqual(provider.getDisplayValue('name'), 'demo');
  });

  it('falls back to process argv and returns a defensive copy of raw arguments', () => {
    const originalArgv = process.argv;
    process.argv = ['node', 'script.js', '--from-process', 'yes'];

    try {
      const provider = new GOCommandLineConfigProvider();
      const rawArguments = provider.getRawArguments();

      rawArguments.push('--mutated');

      assert.strictEqual(provider.getValue('from.process'), 'yes');
      assert.deepStrictEqual(provider.getRawArguments(), ['--from-process', 'yes']);
    } finally {
      process.argv = originalArgv;
    }
  });
});
