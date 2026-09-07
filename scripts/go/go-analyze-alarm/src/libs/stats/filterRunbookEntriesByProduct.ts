/**
 * Filters catalog entries by product, without assuming which products exist.
 */

import type { RunbookCatalogEntry } from '../../types/RunbookCatalogEntry.js';

/**
 * Keeps the entries owned by the requested product.
 *
 * The comparison is case-insensitive and trims the input, so `--stats-product
 * interop` and `--stats-product INTEROP` behave the same.
 * Complexity: O(N) over the entries.
 *
 * @param entries - Catalog entries to filter
 * @param product - Product name; when omitted or blank every entry is kept
 * @returns The entries owned by that product, in input order
 *
 * @example
 * ```typescript
 * filterRunbookEntriesByProduct(entries, 'interop'); // only INTEROP runbooks
 * filterRunbookEntriesByProduct(entries, undefined); // every runbook
 * ```
 */
export function filterRunbookEntriesByProduct(
  entries: ReadonlyArray<RunbookCatalogEntry>,
  product: string | undefined,
): ReadonlyArray<RunbookCatalogEntry> {
  const normalized = product?.trim().toUpperCase();
  if (normalized === undefined || normalized === '') return entries;
  return entries.filter((entry) => entry.product.toUpperCase() === normalized);
}

/**
 * Lists the distinct products present in the entries, sorted alphabetically.
 * Used to explain an empty filter result instead of printing an empty report.
 *
 * @param entries - Catalog entries to inspect
 * @returns Distinct product names
 */
export function listRunbookEntryProducts(entries: ReadonlyArray<RunbookCatalogEntry>): ReadonlyArray<string> {
  return [...new Set(entries.map((entry) => entry.product))].sort((left, right) => left.localeCompare(right));
}
