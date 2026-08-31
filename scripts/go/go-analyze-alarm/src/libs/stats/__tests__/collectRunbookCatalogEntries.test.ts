import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { collectRunbookCatalogEntries, type RunbookCatalogSource } from '../collectRunbookCatalogEntries.js';

/** Minimal registry stand-in: only the two members the collector reads. */
function fakeSource(): RunbookCatalogSource {
  const descriptors = [
    {
      key: 'zeta-alarm',
      version: '1.0.0',
      name: 'Zeta',
      description: 'Zeta runbook',
      team: 'GO',
      kind: 'LAMBDA',
      categories: ['DELIVERY'],
      tags: ['lambda'],
      alarmNames: ['zeta-dev', 'zeta-prod'],
      definitionDigest: 'digest-zeta',
    },
    {
      key: 'alpha-alarm',
      version: '2.0.0',
      name: 'Alpha',
      description: 'Alpha runbook',
      team: 'GO',
      kind: 'APIGW',
      categories: ['INTEROP'],
      tags: ['apigw'],
      alarmNames: ['alpha-prod'],
      definitionDigest: 'digest-alpha',
    },
    {
      key: 'orphan-alarm',
      version: '1.0.0',
      name: 'Orphan',
      description: 'Not resolvable',
      team: 'GO',
      kind: 'SERVICE',
      categories: [],
      tags: [],
      alarmNames: [],
      definitionDigest: 'digest-orphan',
    },
  ];

  const runbooks = new Map([
    [
      'zeta-alarm',
      {
        product: 'SEND',
        steps: [{}, {}, {}],
        knownCases: [{ analysis: {} }, {}],
      },
    ],
    [
      'alpha-alarm',
      {
        product: 'INTEROP',
        steps: [{}],
        knownCases: [{ analysis: {} }],
      },
    ],
  ]);

  return {
    listDescriptors: () => descriptors,
    resolveByKey: (key: string) => {
      const runbook = runbooks.get(key);
      if (runbook === undefined) return undefined;
      return {
        descriptor: descriptors.find((item) => item.key === key),
        product: runbook.product,
        build: () => ({ steps: runbook.steps, knownCases: runbook.knownCases }),
      };
    },
  } as unknown as RunbookCatalogSource;
}

describe('collectRunbookCatalogEntries', () => {
  it('flattens descriptors and runbook shape, sorted by key', () => {
    const entries = collectRunbookCatalogEntries(fakeSource());

    assert.deepEqual(
      entries.map((item) => item.key),
      ['alpha-alarm', 'zeta-alarm'],
    );

    const zeta = entries.find((item) => item.key === 'zeta-alarm');
    assert.ok(zeta !== undefined);
    assert.equal(zeta.product, 'SEND');
    assert.equal(zeta.kind, 'LAMBDA');
    assert.equal(zeta.stepCount, 3);
    assert.equal(zeta.knownCaseCount, 2);
    assert.equal(zeta.annotatedKnownCaseCount, 1);
    assert.deepEqual(zeta.alarmNames, ['zeta-dev', 'zeta-prod']);
  });

  it('skips descriptors that the registry cannot resolve', () => {
    const entries = collectRunbookCatalogEntries(fakeSource());

    assert.equal(
      entries.some((item) => item.key === 'orphan-alarm'),
      false,
    );
  });

  it('reads the real repository catalog without any remote call', () => {
    const entries = collectRunbookCatalogEntries();

    assert.ok(entries.length > 0);
    for (const item of entries) {
      assert.ok(item.key.length > 0);
      assert.ok(item.product.length > 0);
      assert.ok(item.kind.length > 0);
      assert.ok(item.annotatedKnownCaseCount <= item.knownCaseCount);
    }
  });
});
