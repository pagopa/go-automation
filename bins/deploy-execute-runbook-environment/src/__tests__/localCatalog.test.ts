import assert from 'node:assert/strict';
import { rm, stat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { describe, it } from 'node:test';

import type { AutomaticRunbookDescriptorV1 } from '../external.js';
import { validateAutomaticRunbookCatalog } from '../external.js';
import { buildLocalCatalog, createLocalCatalogOutputPath, parseLocalCatalogOptions } from '../localCatalog.js';

const RUNBOOK: AutomaticRunbookDescriptorV1 = {
  key: 'sample-runbook',
  version: '1.0.0',
  name: 'Sample',
  description: 'Sample runbook',
  team: 'GO',
  kind: 'SERVICE',
  categories: ['SERVICE_ERROR'],
  tags: ['local'],
  alarmNames: ['sample-alarm'],
  definitionDigest: `sha256-${'a'.repeat(64)}`,
};

describe('local automatic runbook catalog', () => {
  it('uses safe development defaults and accepts explicit overrides', () => {
    const defaults = parseLocalCatalogOptions([]);
    assert.equal(defaults.environment, 'development');
    assert.equal(defaults.output, undefined);
    assert.equal(defaults.changeNote, 'Local development catalog');

    const explicit = parseLocalCatalogOptions([
      '--environment',
      'test-env',
      '--output',
      './catalog.json',
      '--artifact-revision',
      'local-test',
    ]);
    assert.equal(explicit.environment, 'test-env');
    assert.equal(explicit.artifactRevision, 'local-test');
    assert.match(explicit.output ?? '', /catalog\.json$/u);
  });

  it('creates private, unique temporary output directories by default', async () => {
    const first = await createLocalCatalogOutputPath(undefined);
    const second = await createLocalCatalogOutputPath(undefined);
    try {
      assert.notEqual(dirname(first), dirname(second));
      if (process.platform !== 'win32') {
        assert.equal((await stat(dirname(first))).mode & 0o077, 0);
        assert.equal((await stat(dirname(second))).mode & 0o077, 0);
      }
    } finally {
      await Promise.all([rm(dirname(first), { recursive: true }), rm(dirname(second), { recursive: true })]);
    }
  });

  it('builds a contract-valid catalog from the real descriptor shape', () => {
    const catalog = buildLocalCatalog({
      options: parseLocalCatalogOptions(['--artifact-revision', 'local-test']),
      sourceRevision: 'abcdef123456',
      runbooks: [RUNBOOK],
      publishedAt: '2026-07-02T10:00:00.000Z',
    });
    assert.doesNotThrow(() => validateAutomaticRunbookCatalog(catalog));
    assert.equal(catalog.environment, 'development');
    assert.equal(catalog.worker.artifactRevision, 'local-test');
    assert.equal(catalog.release.actorArn, 'local-development');
  });

  it('rejects unknown and malformed options', () => {
    assert.throws(() => parseLocalCatalogOptions(['--unknown', 'x']), /Unknown option/u);
    assert.throws(() => parseLocalCatalogOptions(['--environment', 'PROD']), /environment is invalid/u);
  });
});
