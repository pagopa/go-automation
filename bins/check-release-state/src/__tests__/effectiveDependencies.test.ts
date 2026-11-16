import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { effectiveDependencies, readCatalogs } from '../effectiveDependencies.js';
import { FakeGit } from './fakes.js';

const WORKSPACE = `packages:\n  - packages/*\ncatalog:\n  'undici': '8.12.4'\n  luxon: ^3.7.0\ncatalogs:\n  aws:\n    '@aws-sdk/client-s3': '3.1167.0'\n`;

describe('effective dependencies (catalog resolution)', () => {
  it('reads the default and the named catalogs', () => {
    const git = new FakeGit().commit('c', new Map([['pnpm-workspace.yaml', WORKSPACE]]));
    const catalogs = readCatalogs(git, 'c');
    assert.strictEqual(catalogs.get('default')?.get('undici'), '8.12.4');
    assert.strictEqual(catalogs.get('aws')?.get('@aws-sdk/client-s3'), '3.1167.0');
    assert.strictEqual(readCatalogs(git, 'missing').size, 0);
  });

  it('resolves catalog ranges, skips internal packages and ignores devDependencies', () => {
    const git = new FakeGit().commit('c', new Map([['pnpm-workspace.yaml', WORKSPACE]]));
    const manifest = {
      dependencies: { undici: 'catalog:', '@pagopa/go-common': 'workspace:^', tslib: '^2.8.0' },
      peerDependencies: { '@aws-sdk/client-s3': 'catalog:aws' },
      devDependencies: { typescript: 'catalog:' },
    };
    assert.strictEqual(
      effectiveDependencies(manifest, readCatalogs(git, 'c')),
      ['dependencies:tslib@^2.8.0', 'dependencies:undici@8.12.4', 'peerDependencies:@aws-sdk/client-s3@3.1167.0'].join(
        '\n',
      ),
    );
  });
});
