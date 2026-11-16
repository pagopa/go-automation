import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { GOSecretsSpecifierFactory } from '../../GOSecretsSpecifier.js';
import { GOEnvironmentConfigProvider } from '../GOEnvironmentConfigProvider.js';

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'go-common-env-provider-'));
}

describe('GOEnvironmentConfigProvider', () => {
  it('loads values from a provided environment source and resolves transformed keys', () => {
    const source: NodeJS.ProcessEnv = {
      HTTP_TIMEOUT: '30',
      DIRECT_KEY: 'direct',
      TAGS: 'one, two,, three',
      SINGLE_VALUE: 'only,',
      UNDEFINED_VALUE: undefined,
    };
    const provider = new GOEnvironmentConfigProvider({ source });

    assert.strictEqual(provider.getName(), 'Environment');
    assert.strictEqual(provider.getValue('http.timeout'), '30');
    assert.strictEqual(provider.getValue('HTTP_TIMEOUT'), '30');
    assert.strictEqual(provider.getValue('DIRECT_KEY'), 'direct');
    assert.deepStrictEqual(provider.getValue('tags'), ['one', 'two', 'three']);
    assert.strictEqual(provider.getValue('single.value'), 'only,');
    assert.strictEqual(provider.getValue('undefined.value'), undefined);
    assert.strictEqual(provider.hasKey('http.timeout'), true);
    assert.strictEqual(provider.hasKey('HTTP_TIMEOUT'), true);
    assert.strictEqual(provider.hasKey('missing'), false);
  });

  it('loads and reloads an environment file with custom display name, encoding and separator', async () => {
    const dir = await makeTempDir();
    const envPath = path.join(dir, 'config.env');
    await fs.writeFile(envPath, 'NAME=demo\nITEMS=one|two|three\n', 'utf-8');

    const provider = new GOEnvironmentConfigProvider({
      environmentFilePath: envPath,
      displayName: 'EnvFile',
      arraySeparator: '|',
      encoding: 'utf-8',
    });

    assert.strictEqual(provider.getName(), 'EnvFile');
    assert.strictEqual(provider.getValue('NAME'), 'demo');
    assert.deepStrictEqual(provider.getValue('ITEMS'), ['one', 'two', 'three']);

    await fs.writeFile(envPath, 'NAME=updated\nITEMS=single|\n', 'utf-8');
    provider.reload('utf-8');

    assert.strictEqual(provider.getValue('NAME'), 'updated');
    assert.strictEqual(provider.getValue('ITEMS'), 'single|');
  });

  it('falls back to the provided source when the configured file does not exist', async () => {
    const dir = await makeTempDir();
    const missingPath = path.join(dir, 'missing.env');
    const provider = new GOEnvironmentConfigProvider({
      environmentFilePath: missingPath,
      source: {
        FALLBACK_VALUE: 'loaded',
      },
    });

    assert.strictEqual(provider.getName(), `Environment(${missingPath})`);
    assert.strictEqual(provider.getValue('fallback.value'), 'loaded');
  });

  it('wraps malformed env files and rejects reload without a file path', async () => {
    const dir = await makeTempDir();
    const envPath = path.join(dir, 'bad.env');
    await fs.writeFile(envPath, '1INVALID=value\n', 'utf-8');

    assert.throws(
      () => new GOEnvironmentConfigProvider({ environmentFilePath: envPath }),
      /Failed to load environment file .*Invalid environment variable name/u,
    );

    const provider = new GOEnvironmentConfigProvider({ source: { NAME: 'demo' } });
    assert.throws(() => provider.reload(), /Cannot reload: provider was not initialized with environmentFilePath/u);
  });

  it('reloads from process.env and redacts configured secrets', () => {
    const envKey = 'GO_ENV_PROVIDER_TEST_VALUE';
    const originalValue = process.env[envKey];

    try {
      process.env[envKey] = 'before';
      const provider = new GOEnvironmentConfigProvider({
        source: {
          GO_ENV_PROVIDER_TEST_VALUE: 'initial',
          API_TOKEN: 'super-secret',
        },
        secretsSpecifier: GOSecretsSpecifierFactory.specific(['api.token']),
      });

      assert.strictEqual(provider.getValue('go.env.provider.test.value'), 'initial');
      assert.strictEqual(provider.isSecret('api.token'), true);
      assert.strictEqual(provider.isSecret('missing'), false);
      assert.strictEqual(provider.getDisplayValue('api.token'), '[REDACTED (12 chars)]');

      process.env[envKey] = 'after';
      provider.reloadFromProcess();

      assert.strictEqual(provider.getValue('go.env.provider.test.value'), 'after');
    } finally {
      if (originalValue === undefined) {
        delete process.env[envKey];
      } else {
        process.env[envKey] = originalValue;
      }
    }
  });
});
