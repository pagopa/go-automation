import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import type { AutomaticRunbookCatalogV1, BuildAutomaticRunbookCatalogInputV1 } from '../AutomaticRunbookCatalogV1.js';
import {
  buildAutomaticRunbookCatalog,
  computeAutomaticRunbookCatalogRevision,
  validateAutomaticRunbookCatalog,
} from '../automaticRunbookCatalogRevision.js';

const INPUT: BuildAutomaticRunbookCatalogInputV1 = {
  schemaVersion: 1,
  environment: 'production',
  worker: { artifactRevision: 'abc123', commandSchemaVersion: '1.0.0' },
  runbooks: [
    {
      key: 'send-apigw-analysis',
      version: '1.2.3',
      name: 'SEND API Gateway analysis',
      description: 'Analyzes the SEND API Gateway alarm',
      team: 'GO',
      kind: 'APIGW',
      categories: ['DELIVERY'],
      tags: ['send'],
      alarmNames: ['send-api-errors'],
      definitionDigest: `sha256-${'a'.repeat(64)}`,
    },
  ],
  publishedAt: '2026-07-01T10:00:00.000Z',
  release: { actorArn: 'arn:aws:sts::123456789012:assumed-role/deployer/operator', changeNote: 'test release' },
};

describe('AutomaticRunbookCatalogV1', () => {
  it('excludes publication metadata from the deterministic revision', () => {
    const first = buildAutomaticRunbookCatalog(INPUT);
    const second = buildAutomaticRunbookCatalog({
      ...INPUT,
      publishedAt: '2026-07-02T10:00:00.000Z',
      release: { ...INPUT.release, changeNote: 'same artifact republished' },
    });

    assert.strictEqual(first.revision, second.revision);
    const { publishedAt: _publishedAt, release: _release, ...payload } = INPUT;
    assert.strictEqual(first.revision, computeAutomaticRunbookCatalogRevision(payload));
    assert.doesNotThrow(() => validateAutomaticRunbookCatalog(first));
  });

  it('rejects an invalid revision, unordered descriptors and ambiguous alarms', () => {
    const catalog = buildAutomaticRunbookCatalog(INPUT);
    assert.throws(
      () => validateAutomaticRunbookCatalog({ ...catalog, revision: `sha256-${'0'.repeat(64)}` }),
      /revision/,
    );

    const second = { ...INPUT.runbooks[0]!, key: 'aaa', alarmNames: ['send-api-errors'] as [string] };
    assert.throws(
      () => buildAutomaticRunbookCatalog({ ...INPUT, runbooks: [INPUT.runbooks[0]!, second] }),
      /sorted|Ambiguous/,
    );
  });

  it('validates the vendored fixtures', async () => {
    const root = resolve(import.meta.dirname, '../../../../contracts/runbook-automation/v1/fixtures');
    const valid = JSON.parse(
      await readFile(resolve(root, 'automatic-runbook-catalog.valid.json'), 'utf8'),
    ) as AutomaticRunbookCatalogV1;
    const invalid = JSON.parse(
      await readFile(resolve(root, 'automatic-runbook-catalog.invalid-revision.json'), 'utf8'),
    ) as AutomaticRunbookCatalogV1;
    assert.doesNotThrow(() => validateAutomaticRunbookCatalog(valid));
    assert.throws(() => validateAutomaticRunbookCatalog(invalid), /revision/);
  });
});
