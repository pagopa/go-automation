import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { computeRunbookStatistics } from '../computeRunbookStatistics.js';
import type { RunbookCatalogEntry } from '../../../types/RunbookCatalogEntry.js';

const GENERATED_AT = '2026-01-01T00:00:00.000Z';

function entry(overrides: Partial<RunbookCatalogEntry> & Pick<RunbookCatalogEntry, 'key'>): RunbookCatalogEntry {
  return {
    name: overrides.key,
    version: '1.0.0',
    product: 'SEND',
    kind: 'SERVICE',
    categories: [],
    tags: [],
    alarmNames: [],
    stepCount: 0,
    knownCaseCount: 0,
    annotatedKnownCaseCount: 0,
    ...overrides,
  };
}

describe('computeRunbookStatistics', () => {
  it('aggregates totals over the catalog', () => {
    const report = computeRunbookStatistics(
      [
        entry({
          key: 'a',
          alarmNames: ['a-dev', 'a-prod'],
          stepCount: 4,
          knownCaseCount: 3,
          annotatedKnownCaseCount: 2,
        }),
        entry({ key: 'b', alarmNames: ['b-prod'], stepCount: 6, knownCaseCount: 0, annotatedKnownCaseCount: 0 }),
      ],
      GENERATED_AT,
    );

    assert.equal(report.generatedAt, GENERATED_AT);
    assert.deepEqual(report.totals, {
      runbooks: 2,
      alarms: 3,
      knownCases: 3,
      annotatedKnownCases: 2,
      steps: 10,
      runbooksWithoutKnownCases: 1,
      runbooksWithMultipleAlarms: 1,
    });
  });

  it('counts distinct alarm names only once', () => {
    const report = computeRunbookStatistics(
      [entry({ key: 'a', alarmNames: ['shared'] }), entry({ key: 'b', alarmNames: ['shared', 'own'] })],
      GENERATED_AT,
    );

    assert.equal(report.totals.alarms, 2);
  });

  it('sorts buckets by runbook count and then by label', () => {
    const report = computeRunbookStatistics(
      [
        entry({ key: 'a', product: 'INTEROP' }),
        entry({ key: 'b', product: 'SEND' }),
        entry({ key: 'c', product: 'SEND' }),
      ],
      GENERATED_AT,
    );

    assert.deepEqual(
      report.byProduct.map((bucket) => [bucket.label, bucket.runbooks]),
      [
        ['SEND', 2],
        ['INTEROP', 1],
      ],
    );
  });

  it('builds the product x kind matrix without empty cells, sorted for stable output', () => {
    const report = computeRunbookStatistics(
      [
        entry({ key: 'a', product: 'SEND', kind: 'APIGW', alarmNames: ['x'] }),
        entry({ key: 'b', product: 'SEND', kind: 'APIGW', alarmNames: ['y'] }),
        entry({ key: 'c', product: 'INTEROP', kind: 'LAMBDA', alarmNames: ['z'] }),
      ],
      GENERATED_AT,
    );

    assert.deepEqual(report.productKindMatrix, [
      { product: 'INTEROP', kind: 'LAMBDA', runbooks: 1, alarms: 1 },
      { product: 'SEND', kind: 'APIGW', runbooks: 2, alarms: 2 },
    ]);
  });

  it('lets multi-valued categories and tags overlap across buckets', () => {
    const report = computeRunbookStatistics(
      [
        entry({ key: 'a', categories: ['AUTHORIZATION', 'INTEGRATION'], tags: ['k8s'] }),
        entry({ key: 'b', categories: ['INTEGRATION'], tags: ['k8s', 'apigw'] }),
      ],
      GENERATED_AT,
    );

    const categoryAssignments = report.byCategory.reduce((sum, bucket) => sum + bucket.runbooks, 0);
    assert.equal(categoryAssignments, 3);
    assert.equal(report.totals.runbooks, 2);
    assert.deepEqual(
      report.byCategory.map((bucket) => bucket.label),
      ['INTEGRATION', 'AUTHORIZATION'],
    );
    assert.deepEqual(
      report.byTag.map((bucket) => [bucket.label, bucket.runbooks]),
      [
        ['k8s', 2],
        ['apigw', 1],
      ],
    );
  });

  it('returns zeroed totals and empty buckets for an empty catalog', () => {
    const report = computeRunbookStatistics([], GENERATED_AT);

    assert.equal(report.totals.runbooks, 0);
    assert.equal(report.totals.alarms, 0);
    assert.deepEqual(report.byProduct, []);
    assert.deepEqual(report.productKindMatrix, []);
    assert.deepEqual(report.entries, []);
  });
});
