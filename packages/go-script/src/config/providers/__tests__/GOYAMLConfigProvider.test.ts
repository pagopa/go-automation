import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { GOYAMLParser } from '@pagopa/go-common/parsers';

import { GOSecretsSpecifierFactory } from '../../GOSecretsSpecifier.js';
import { GOYAMLConfigProvider } from '../GOYAMLConfigProvider.js';

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'go-script-yaml-provider-'));
}

describe('GOYAMLConfigProvider', () => {
  it('loads nested data objects and redacts configured secrets', () => {
    const provider = new GOYAMLConfigProvider({
      data: {
        service: { url: 'https://example.test', retry: 3 },
        token: 'secret-token',
        tags: ['alpha', 2, true],
      },
      secretsSpecifier: GOSecretsSpecifierFactory.specific(['token']),
    });

    assert.strictEqual(provider.getName(), 'YAML(data)');
    assert.strictEqual(provider.getValue('service.url'), 'https://example.test');
    assert.strictEqual(provider.getValue('service.retry'), '3');
    assert.deepStrictEqual(provider.getValue('tags'), ['alpha', '2', 'true']);
    assert.strictEqual(provider.isSecret('token'), true);
    assert.strictEqual(provider.isSecret('service.url'), false);
    assert.strictEqual(provider.isSecret('missing'), false);
    assert.strictEqual(provider.getDisplayValue('token'), '[REDACTED (12 chars)]');
  });

  it('loads, names and reloads YAML files', async () => {
    const dir = await makeTempDir();
    const filePath = path.join(dir, 'config.yaml');
    await fs.writeFile(filePath, 'feature:\n  enabled: true\n', 'utf-8');

    const provider = new GOYAMLConfigProvider({ filePath, encoding: 'utf-8' });

    assert.strictEqual(provider.getName(), `YAML(${filePath})`);
    assert.strictEqual(provider.getValue('feature.enabled'), 'true');

    await fs.writeFile(filePath, 'feature:\n  enabled: false\nname: updated\n', 'utf-8');
    provider.reload('utf-8');

    assert.strictEqual(provider.getValue('feature.enabled'), 'false');
    assert.strictEqual(provider.getValue('name'), 'updated');
  });

  it('uses a custom display name and allows optional missing configuration', async () => {
    const dir = await makeTempDir();
    const provider = new GOYAMLConfigProvider({
      filePath: path.join(dir, 'missing.yaml'),
      optional: true,
      displayName: 'OptionalYAML',
    });

    assert.strictEqual(provider.getName(), 'OptionalYAML');
    assert.deepStrictEqual(provider.getAllKeys(), []);
    assert.deepStrictEqual(new GOYAMLConfigProvider({ optional: true }).getAllKeys(), []);
  });

  it('rejects missing files, invalid YAML and a missing source', async () => {
    const dir = await makeTempDir();
    const invalidPath = path.join(dir, 'invalid.yaml');
    await fs.writeFile(invalidPath, 'feature: [unclosed\n', 'utf-8');

    assert.throws(
      () => new GOYAMLConfigProvider({ filePath: path.join(dir, 'missing.yaml') }),
      /Configuration file not found/,
    );
    assert.throws(() => new GOYAMLConfigProvider({ filePath: invalidPath }), /Failed to load YAML config/);
    assert.throws(() => new GOYAMLConfigProvider({}), /requires either filePath or data/);
    assert.throws(() => new GOYAMLConfigProvider({ data: {} }).reload(), /not initialized with filePath/);
  });

  it('exports the flattened configuration back to nested YAML', () => {
    const provider = new GOYAMLConfigProvider({
      data: { http: { timeout: 60, hosts: ['a', 'b'] }, name: 'svc' },
    });

    assert.deepStrictEqual(GOYAMLParser.parseContent(provider.toYAML()), {
      http: { timeout: '60', hosts: ['a', 'b'] },
      name: 'svc',
    });
  });
});
