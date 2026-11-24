/**
 * The three-way comparison of one table against its configuration file.
 *
 * Matching is done through a map keyed by the item's key, not by searching the
 * other side for each item. The reference nests a `find` inside a `forEach`,
 * in both directions: on `pn-addressManager-Cap`, which holds 4.714 items,
 * that is about 44 million key comparisons for one table.
 *
 * A fourth category exists that the reference does not have. Three tables
 * declare a `protectedKey` — items that live in the table on purpose and that
 * no configuration file declares, such as `cxId = pn-cons-000` in
 * `pn-EcAnagrafica`. Counting those as drift reports the same false positive
 * on every run, so they are reported as what they are.
 *
 * A fifth is the same key read in the other direction. The reference checks it
 * in a separate `validate` command, which `sync` runs first and `compare`
 * never runs at all: a file that declares a protected item is a defect whether
 * or not anybody is about to write it, so it is checked on every run here.
 */

import { deepEqualWire } from './deepEqualWire.js';
import { displayKey, itemKey } from './itemKey.js';
import type { AnagraficaTable, ItemDifference } from '../types/index.js';

/** What the comparison of one table found. */
export interface TableComparison {
  /** Items on both sides that are not equal. */
  readonly different: ReadonlyArray<ItemDifference>;

  /** Items only the table holds, which no protected key explains. */
  readonly onlyLive: ReadonlyArray<ItemDifference>;

  /** Items only the repository declares. */
  readonly onlyRepository: ReadonlyArray<ItemDifference>;

  /** Live-only items a protected key accounts for. */
  readonly protectedItems: ReadonlyArray<ItemDifference>;

  /** Items the file declares that the protected key forbids it to. */
  readonly protectedInFile: ReadonlyArray<ItemDifference>;
}

/** Indexes items by their key, reporting a file that declares one twice. */
function index(
  items: ReadonlyArray<Record<string, unknown>>,
  table: AnagraficaTable,
  side: string,
): Map<string, Record<string, unknown>> {
  const byKey = new Map<string, Record<string, unknown>>();

  for (const item of items) {
    let key: string;
    try {
      key = itemKey(item, table.keys);
    } catch (error: unknown) {
      throw new Error(`${table.name}: ${side} ${(error as Error).message}`, { cause: error });
    }

    if (byKey.has(key)) {
      // Silently keeping one of them would make the counts disagree with the
      // file for a reason nobody could see.
      throw new Error(`${table.name}: ${side} declares the key '${displayKey(key)}' more than once`);
    }
    byKey.set(key, item);
  }

  return byKey;
}

/** Whether an item carries a value the table map marks as protected. */
function isProtected(item: Record<string, unknown>, table: AnagraficaTable): boolean {
  const protectedKey = table.protectedKey;
  if (protectedKey === undefined) return false;

  const attribute = item[protectedKey.name];
  if (typeof attribute !== 'object' || attribute === null) return false;

  const value = (attribute as Record<string, unknown>)['S'];
  return typeof value === 'string' && protectedKey.values.includes(value);
}

/**
 * Compares the live table against the items the repository declares.
 *
 * @param table - Table declaration, carrying its key schema
 * @param liveItems - Items read from the table, in wire form
 * @param repositoryItems - Items the configuration file declares, in wire form
 * @returns The five categories
 * @throws Error when an item cannot be keyed, or a side declares a key twice
 */
export function compareTable(
  table: AnagraficaTable,
  liveItems: ReadonlyArray<Record<string, unknown>>,
  repositoryItems: ReadonlyArray<Record<string, unknown>>,
): TableComparison {
  const live = index(liveItems, table, 'the table');
  const repository = index(repositoryItems, table, 'the file');

  const different: ItemDifference[] = [];
  const onlyLive: ItemDifference[] = [];
  const onlyRepository: ItemDifference[] = [];
  const protectedItems: ItemDifference[] = [];
  const protectedInFile: ItemDifference[] = [];

  // Read before anything is categorised: whatever the diff says, a file that
  // declares a protected item must not be written, and the answer does not
  // depend on whether that item happens to match what is live.
  for (const [key, repositoryItem] of repository) {
    if (isProtected(repositoryItem, table)) {
      protectedInFile.push({ key: displayKey(key), live: live.get(key), repository: repositoryItem });
    }
  }

  for (const [key, liveItem] of live) {
    const repositoryItem = repository.get(key);
    if (repositoryItem === undefined) {
      const entry = { key: displayKey(key), live: liveItem, repository: undefined };
      (isProtected(liveItem, table) ? protectedItems : onlyLive).push(entry);
      continue;
    }
    if (!deepEqualWire(liveItem, repositoryItem)) {
      different.push({ key: displayKey(key), live: liveItem, repository: repositoryItem });
    }
  }

  for (const [key, repositoryItem] of repository) {
    if (!live.has(key)) {
      onlyRepository.push({ key: displayKey(key), live: undefined, repository: repositoryItem });
    }
  }

  return { different, onlyLive, onlyRepository, protectedItems, protectedInFile };
}
