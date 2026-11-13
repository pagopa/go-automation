import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { GOSecretsSpecifierFactory } from '../../GOSecretsSpecifier.js';
import { GOJSONConfigProvider } from '../GOJSONConfigProvider.js';

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'go-common-json-provider-'));
}

describe('GOJSONConfigProvider', () => {
  it('loads nested data objects and redacts configured secrets', () => {
    const provider = new GOJSONConfigProvider({
      data: {
        service: {
          url: 'https://example.test',
          retry: 3,
        },
        token: 'secret-token',
        tags: ['alpha', 2, true],
      },
      secretsSpecifier: GOSecretsSpecifierFactory.specific(['token']),
    });

    assert.strictEqual(provider.getName(), 'JSON(data)');
    assert.strictEqual(provider.getValue('service.url'), 'https://example.test');
    assert.strictEqual(provider.getValue('service.retry'), '3');
    assert.deepStrictEqual(provider.getValue('tags'), ['alpha', '2', 'true']);
    assert.strictEqual(provider.isSecret('token'), true);
    assert.strictEqual(provider.isSecret('missing'), false);
    assert.strictEqual(provider.getDisplayValue('token'), '[REDACTED (12 chars)]');
  });

  it('loads, names and reloads JSON files', async () => {
    const dir = await makeTempDir();
    const filePath = path.join(dir, 'config.json');
    await fs.writeFile(filePath, JSON.stringify({ feature: { enabled: true } }), 'utf-8');

    const provider = new GOJSONConfigProvider({ filePath, encoding: 'utf-8' });

    assert.strictEqual(provider.getName(), `JSON(${filePath})`);
    assert.strictEqual(provider.getValue('feature.enabled'), 'true');

    await fs.writeFile(filePath, JSON.stringify({ feature: { enabled: false }, name: 'updated' }), 'utf-8');
    provider.reload('utf-8');

    assert.strictEqual(provider.getValue('feature.enabled'), 'false');
    assert.strictEqual(provider.getValue('name'), 'updated');
  });

  it('uses a custom display name and allows optional missing configuration', async () => {
    const dir = await makeTempDir();
    const missingPath = path.join(dir, 'missing.json');
    const fileProvider = new GOJSONConfigProvider({
      filePath: missingPath,
      optional: true,
      displayName: 'OptionalJSON',
    });
    const dataProvider = new GOJSONConfigProvider({
      optional: true,
      displayName: 'EmptyJSON',
    });

    assert.strictEqual(fileProvider.getName(), 'OptionalJSON');
    assert.deepStrictEqual(fileProvider.getAllKeys(), []);
    assert.strictEqual(dataProvider.getName(), 'EmptyJSON');
    assert.deepStrictEqual(dataProvider.getAllKeys(), []);
  });

  it('throws for missing required files, malformed JSON and reload without a file path', async () => {
    const dir = await makeTempDir();
    const missingPath = path.join(dir, 'missing.json');
    const badPath = path.join(dir, 'bad.json');
    await fs.writeFile(badPath, '{bad json', 'utf-8');

    assert.throws(() => new GOJSONConfigProvider({ filePath: missingPath }), /Configuration file not found/u);
    assert.throws(() => new GOJSONConfigProvider({ filePath: badPath }), /Failed to load JSON config from/u);
    assert.throws(() => new GOJSONConfigProvider({ optional: false }), /requires either filePath or data option/u);
    assert.throws(
      () => new GOJSONConfigProvider({ data: { name: 'demo' } }).reload(),
      /Cannot reload: provider was not initialized with filePath/u,
    );
  });
});
