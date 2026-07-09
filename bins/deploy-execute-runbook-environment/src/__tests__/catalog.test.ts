import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCatalog, diffCatalog } from '../catalog.js';

const RUNBOOKS = [
  {
    key: 'send-apigw-analysis',
    version: '1.0.0',
    name: 'SEND API Gateway analysis',
    description: 'Analyzes a SEND API Gateway alarm',
    team: 'GO',
    kind: 'APIGW' as const,
    categories: ['DELIVERY'],
    tags: ['send'],
    alarmNames: ['send-api-errors'] as [string],
    definitionDigest: `sha256-${'a'.repeat(64)}`,
  },
] as const;

const BASE = buildCatalog({
  environment: 'test',
  artifactRevision: 'a',
  actorArn: 'test',
  changeNote: 'base',
  publishedAt: '2026-07-01T00:00:00.000Z',
  runbooks: RUNBOOKS,
});

describe('catalog rollout classification', () => {
  it('classifies a worker-only revision change as compatible', () => {
    const next = buildCatalog({
      environment: 'test',
      artifactRevision: 'b',
      actorArn: 'test',
      changeNote: 'worker change',
      publishedAt: '2026-07-02T00:00:00.000Z',
      runbooks: RUNBOOKS,
    });
    assert.strictEqual(diffCatalog(BASE, next).kind, 'COMPATIBLE');
  });

  it('classifies a removed runbook as incompatible and identifies it for drain', () => {
    const removed = BASE.runbooks[0]!;
    const next = buildCatalog({
      environment: 'test',
      artifactRevision: 'b',
      actorArn: 'test',
      changeNote: 'remove',
      runbooks: BASE.runbooks.slice(1),
    });
    const diff = diffCatalog(BASE, next);
    assert.strictEqual(diff.kind, 'INCOMPATIBLE');
    assert.deepStrictEqual(diff.incompatible, [removed.key]);
  });

  it('classifies an identical payload as unchanged regardless of publication metadata', () => {
    const next = buildCatalog({
      environment: 'test',
      artifactRevision: 'a',
      actorArn: 'someone-else',
      changeNote: 'republish',
      publishedAt: '2026-07-03T00:00:00.000Z',
      runbooks: RUNBOOKS,
    });
    const diff = diffCatalog(BASE, next);
    assert.strictEqual(diff.kind, 'UNCHANGED');
    assert.deepStrictEqual(diff.incompatible, []);
  });

  it('classifies an alarm-name change of an existing key as incompatible', () => {
    const next = buildCatalog({
      environment: 'test',
      artifactRevision: 'a',
      actorArn: 'test',
      changeNote: 'rename alarm',
      runbooks: [{ ...RUNBOOKS[0], alarmNames: ['send-api-errors-renamed'] as [string] }],
    });
    const diff = diffCatalog(BASE, next);
    assert.strictEqual(diff.kind, 'INCOMPATIBLE');
    assert.deepStrictEqual(diff.incompatible, [RUNBOOKS[0].key]);
  });

  it('classifies adding an alarm alias to an existing key as incompatible', () => {
    const next = buildCatalog({
      environment: 'test',
      artifactRevision: 'a',
      actorArn: 'test',
      changeNote: 'add alarm alias',
      runbooks: [{ ...RUNBOOKS[0], alarmNames: ['send-api-errors', 'send-api-errors-att'] as [string, string] }],
    });
    const diff = diffCatalog(BASE, next);
    assert.strictEqual(diff.kind, 'INCOMPATIBLE');
    assert.deepStrictEqual(diff.incompatible, [RUNBOOKS[0].key]);
  });

  it('classifies a version bump of an existing key as incompatible', () => {
    const next = buildCatalog({
      environment: 'test',
      artifactRevision: 'b',
      actorArn: 'test',
      changeNote: 'bump',
      runbooks: [{ ...RUNBOOKS[0], version: '2.0.0' }],
    });
    const diff = diffCatalog(BASE, next);
    assert.strictEqual(diff.kind, 'INCOMPATIBLE');
    assert.deepStrictEqual(diff.incompatible, [RUNBOOKS[0].key]);
  });
});
