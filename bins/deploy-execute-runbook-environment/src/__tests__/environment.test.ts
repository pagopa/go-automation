import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { readEnvironmentFile } from '../environment.js';

describe('regional environment file parser', () => {
  let directory = '';
  let fileCount = 0;

  /** Writes `content` to a new environment file of the test directory and returns its path. */
  async function environmentFile(content: string): Promise<string> {
    fileCount += 1;
    const path = join(directory, `${String(fileCount)}.env`);
    await writeFile(path, content, 'utf8');
    return path;
  }

  before(async () => {
    directory = await mkdtemp(join(tmpdir(), 'go-deploy-env-'));
  });

  after(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('parses KEY=VALUE lines, trimming values and stripping quotes', async () => {
    const path = await environmentFile(
      '# comment\n\nDEPLOY_ENV=production\nWATCHTOWER_INTERNAL_URL="https://example.test"\nOAM_SOURCE_ACCOUNT_IDS= 123456789012 \n',
    );
    assert.deepEqual(await readEnvironmentFile(path), {
      DEPLOY_ENV: 'production',
      WATCHTOWER_INTERNAL_URL: 'https://example.test',
      OAM_SOURCE_ACCOUNT_IDS: '123456789012',
    });
  });

  const rejected: ReadonlyArray<readonly [string, string, RegExp]> = [
    ['lines that are not KEY=VALUE instead of skipping them', 'DEPLOY_ENV production\n', /is not KEY=VALUE/u],
    ['keys that are not CONSTANT_CASE', 'deploy_env=production\n', /invalid key/u],
    [
      'duplicate keys with the offending line number',
      'DEPLOY_ENV=production\nDEPLOY_ENV=test\n',
      /:2 duplicates key DEPLOY_ENV/u,
    ],
  ];

  for (const [name, content, error] of rejected) {
    it(`rejects ${name}`, async () => {
      await assert.rejects(readEnvironmentFile(await environmentFile(content)), error);
    });
  }
});
