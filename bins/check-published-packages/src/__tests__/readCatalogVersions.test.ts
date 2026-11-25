import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseCatalogVersions } from '../readCatalogVersions.js';
import { closeInternalDependencies } from '../closeInternalDependencies.js';
import type { PackedPackage } from '../types/PackedPackage.js';

describe('parseCatalogVersions', () => {
  it('reads the default catalog block only', () => {
    const versions = parseCatalogVersions(
      [
        'packages:',
        '  - packages/*',
        'catalog:',
        "  '@aws-sdk/client-s3': '3.1167.0'",
        "  esbuild: '^0.28.2'",
        '',
        'overrides:',
        "  x: '1'",
      ].join('\n'),
    );
    assert.deepStrictEqual(
      [...versions],
      [
        ['@aws-sdk/client-s3', '3.1167.0'],
        ['esbuild', '^0.28.2'],
      ],
    );
  });
});

describe('closeInternalDependencies', () => {
  it('adds the published packages a scenario depends on, transitively', () => {
    const entry = (name: string, internalDependencies: ReadonlyArray<string>): PackedPackage => ({
      name,
      version: '0.0.0',
      tarball: `/t/${name}.tgz`,
      enginesNode: '>=22.19.0',
      subpaths: ['.'],
      internalDependencies,
    });
    const packed = new Map([
      ['@pagopa/go-common', entry('@pagopa/go-common', [])],
      ['@pagopa/go-aws', entry('@pagopa/go-aws', ['@pagopa/go-common'])],
      ['@pagopa/go-runbook', entry('@pagopa/go-runbook', ['@pagopa/go-aws', '@pagopa/go-common'])],
    ]);
    assert.deepStrictEqual(closeInternalDependencies(['@pagopa/go-runbook'], packed), [
      '@pagopa/go-aws',
      '@pagopa/go-common',
      '@pagopa/go-runbook',
    ]);
    assert.throws(() => closeInternalDependencies(['@pagopa/unknown'], packed), /not a packed published package/u);
  });
});
