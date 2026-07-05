import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { readEnvironmentFile } from '../environment.js';

async function withEnvFile(content: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'go-deploy-env-'));
  const path = join(directory, 'eu-south-1.env');
  await writeFile(path, content, 'utf8');
  return path;
}

describe('regional environment file parser', () => {
  it('parses KEY=VALUE lines, trimming values and stripping quotes', async () => {
    const path = await withEnvFile(
      '# comment\n\nDEPLOY_ENV=production\nWATCHTOWER_INTERNAL_URL="https://example.test"\nOAM_SOURCE_ACCOUNT_IDS= 123456789012 \n',
    );
    assert.deepEqual(await readEnvironmentFile(path), {
      DEPLOY_ENV: 'production',
      WATCHTOWER_INTERNAL_URL: 'https://example.test',
      OAM_SOURCE_ACCOUNT_IDS: '123456789012',
    });
  });

  it('rejects lines that are not KEY=VALUE instead of skipping them', async () => {
    const path = await withEnvFile('DEPLOY_ENV production\n');
    await assert.rejects(readEnvironmentFile(path), /is not KEY=VALUE/u);
  });

  it('rejects keys that are not CONSTANT_CASE', async () => {
    const path = await withEnvFile('deploy_env=production\n');
    await assert.rejects(readEnvironmentFile(path), /invalid key/u);
  });
});
