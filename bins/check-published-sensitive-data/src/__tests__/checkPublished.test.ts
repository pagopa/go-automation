import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, it } from 'node:test';

import { checkPackedArchives, checkPublishedSources } from '../checkPublished.js';
import { listPublishedPackages } from '../listPublishedPackages.js';
import type { PublishedPackage } from '../types/PublishedPackage.js';
import { CONFIG, DECOY_ACCOUNT_ID } from './fixtures.js';

/** A decoy workspace: one published package carrying a fake non-synthetic id, one private package. */
async function createDecoyWorkspace(root: string): Promise<void> {
  const decoy = path.join(root, 'packages', 'decoy');
  const write = async (relative: string, content: string): Promise<void> => {
    const file = path.join(decoy, relative);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  };
  await write(
    'package.json',
    JSON.stringify({ name: '@pagopa/decoy', version: '0.0.0', files: ['dist', 'src', 'README.md', 'CHANGELOG.md'] }),
  );
  await write('src/accounts.ts', `export const ACCOUNT = '${DECOY_ACCOUNT_ID}';\n`);
  await write('src/__tests__/accounts.test.ts', `const id = '${DECOY_ACCOUNT_ID}';\n`);
  await write('dist/accounts.js', `export const ACCOUNT = '${DECOY_ACCOUNT_ID}';\n`);
  await write('dist/accounts.js.map', '{"sourcesContent":["const p = \\"sso_decoy\\";"]}');
  await write('dist/tsconfig.tsbuildinfo', '{}');
  await write('README.md', 'Run with `--aws-profiles sso_decoy`.\n');
  // UTF-16 with BOM: NUL bytes must not hide it from the gate.
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`Account ${DECOY_ACCOUNT_ID}\n`, 'utf16le')]);
  await fs.writeFile(path.join(decoy, 'CHANGELOG.md'), utf16);
  const internal = path.join(root, 'packages', 'internal');
  await fs.mkdir(internal, { recursive: true });
  await fs.writeFile(
    path.join(internal, 'package.json'),
    JSON.stringify({ name: '@pagopa/internal', private: true, version: '0.0.0' }),
  );
}

describe('published sensitive data gate — decoy package', () => {
  let root = '';
  let packages: ReadonlyArray<PublishedPackage> = [];

  before(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'published-sensitive-data-test-'));
    await createDecoyWorkspace(root);
    packages = await listPublishedPackages(root);
  });

  after(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('lists only the published @pagopa packages', () => {
    assert.deepStrictEqual(
      packages.map((item) => item.name),
      ['@pagopa/decoy'],
    );
  });

  it('G-pub-2 fails on the decoy source and README, never reading the tests', async () => {
    const findings = await checkPublishedSources(packages, CONFIG);
    assert.deepStrictEqual(
      findings.map(({ finding }) => `${finding.file} ${finding.rule}`),
      ['CHANGELOG.md account-id', 'README.md profile-name', 'src/accounts.ts account-id'],
    );
  });

  it('G-pub-1 fails on the packed archive: content of every text file and forbidden entries', async () => {
    const findings = await checkPackedArchives(packages, CONFIG);
    const reported = new Set(findings.map(({ finding }) => `${finding.file} ${finding.rule}`));
    for (const expected of [
      'CHANGELOG.md account-id',
      'README.md profile-name',
      'dist/accounts.js account-id',
      'dist/accounts.js.map profile-name',
      'dist/tsconfig.tsbuildinfo forbidden-entry',
      'src/accounts.ts account-id',
    ]) {
      assert.ok(reported.has(expected), `missing ${expected} in ${[...reported].join(', ')}`);
    }
    assert.ok(findings.every(({ scope }) => scope === '@pagopa/decoy (archive)'));
  });
});
