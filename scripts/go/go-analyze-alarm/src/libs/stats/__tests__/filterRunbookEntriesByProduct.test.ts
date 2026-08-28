import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { filterRunbookEntriesByProduct, listRunbookEntryProducts } from '../filterRunbookEntriesByProduct.js';
import type { RunbookCatalogEntry } from '../../../types/RunbookCatalogEntry.js';
import type { RunbookProduct } from '@go-automation/go-runbook';

function entry(key: string, product: RunbookProduct): RunbookCatalogEntry {
  return {
    key,
    name: key,
    version: '1.0.0',
    product,
    kind: 'SERVICE',
    categories: [],
    tags: [],
    alarmNames: [],
    stepCount: 0,
    knownCaseCount: 0,
    annotatedKnownCaseCount: 0,
  };
}

const ENTRIES: ReadonlyArray<RunbookCatalogEntry> = [entry('a', 'SEND'), entry('b', 'INTEROP'), entry('c', 'SEND')];

describe('filterRunbookEntriesByProduct', () => {
  it('returns every entry when no product is requested', () => {
    assert.equal(filterRunbookEntriesByProduct(ENTRIES, undefined).length, 3);
    assert.equal(filterRunbookEntriesByProduct(ENTRIES, '   ').length, 3);
  });

  it('matches the product case-insensitively and ignores surrounding spaces', () => {
    assert.deepEqual(
      filterRunbookEntriesByProduct(ENTRIES, '  send  ').map((item) => item.key),
      ['a', 'c'],
    );
  });

  it('returns no entry for an unknown product', () => {
    assert.deepEqual(filterRunbookEntriesByProduct(ENTRIES, 'PAGOPA'), []);
  });
});

describe('listRunbookEntryProducts', () => {
  it('lists the distinct products in alphabetical order', () => {
    assert.deepEqual(listRunbookEntryProducts(ENTRIES), ['INTEROP', 'SEND']);
  });
});
