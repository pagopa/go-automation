import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { filterRunbookEntriesByProduct, listRunbookEntryProducts } from '../filterRunbookEntriesByProduct.js';
import type { RunbookCatalogEntry } from '../../../types/RunbookCatalogEntry.js';
import type { RunbookProduct } from '@pagopa/go-runbook/toolkits/common';

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
  it('matches the product case-insensitively, trimmed, and keeps every entry without a product', () => {
    const cases: ReadonlyArray<readonly [string | undefined, ReadonlyArray<string>]> = [
      [undefined, ['a', 'b', 'c']],
      ['   ', ['a', 'b', 'c']],
      ['  send  ', ['a', 'c']],
      ['PAGOPA', []],
    ];
    for (const [product, keys] of cases) {
      assert.deepEqual(
        filterRunbookEntriesByProduct(ENTRIES, product).map((item) => item.key),
        keys,
      );
    }
  });
});

describe('listRunbookEntryProducts', () => {
  it('lists the distinct products in alphabetical order', () => {
    assert.deepEqual(listRunbookEntryProducts(ENTRIES), ['INTEROP', 'SEND']);
  });
});
