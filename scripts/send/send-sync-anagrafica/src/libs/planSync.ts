/**
 * Turns the comparison into the list of writes a sync would make.
 *
 * Two things separate this from the reference, and both come from the
 * comparison having already run.
 *
 * The reference writes **the whole file** on every sync, drift or no drift. It
 * has no choice: `syncExecutor` never reads the table. Here the diff is already
 * known, so only the items that differ are written — on `pn-addressManager-Cap`
 * that is the difference between one request and 4.714 items re-put.
 *
 * And a `replace` write is reported with the attributes it would **delete**.
 * A `PutRequest` substitutes the whole item, so an attribute the live table
 * holds and the file omits disappears without appearing anywhere in a diff of
 * items. That is exactly the shape of the `SESEventsList` defect already
 * recorded against `pn-EcAnagrafica.json`, and listing those attributes is what
 * makes it visible before the write rather than after.
 */

import { itemKey } from './itemKey.js';
import type { AnagraficaTable, ItemDifference, SyncMode, TableOutcome } from '../types/index.js';

/** One item a sync would write. */
interface SyncWrite {
  /** The item's key, joined in key-schema order. */
  readonly key: string;

  /** The item as the repository declares it, which is what gets written. */
  readonly item: Record<string, unknown>;

  /** Whether the table has no such item yet, or already has a different one. */
  readonly reason: 'create' | 'overwrite';

  /** Attributes the live item carries that this write would delete. */
  readonly droppedAttributes: ReadonlyArray<string>;
}

/** What a sync would do to one table. */
export interface TableSyncPlan {
  /** Table name. */
  readonly table: string;

  /** Account owning it. */
  readonly account: string;

  /** Profile it would be written with. */
  readonly profile: string;

  /** Key schema, needed to address an item in merge mode. */
  readonly keys: ReadonlyArray<string>;

  /** How this table's items are written. */
  readonly syncMode: SyncMode;

  /** The writes, in comparison order. */
  readonly writes: ReadonlyArray<SyncWrite>;

  /** Items only the table holds, which no sync removes. */
  readonly untouched: number;
}

/**
 * The attributes a write would delete from the live item.
 *
 * Empty in merge mode, where the update names the attributes it sets and says
 * nothing about the others.
 *
 * @param difference - The item on both sides
 * @param syncMode - How the table is written
 * @returns Live attribute names the repository item does not carry
 */
export function droppedAttributes(difference: ItemDifference, syncMode: SyncMode): ReadonlyArray<string> {
  if (syncMode === 'merge') return [];

  const live = difference.live;
  const repository = difference.repository;
  if (live === undefined || repository === undefined) return [];

  return Object.keys(live).filter((attribute) => !(attribute in repository));
}

/** The writes one drifted table would receive. */
function writesOf(outcome: TableOutcome, table: AnagraficaTable): ReadonlyArray<SyncWrite> {
  const writes: SyncWrite[] = [];

  for (const difference of outcome.different) {
    if (difference.repository === undefined) continue;
    writes.push({
      key: difference.key,
      item: difference.repository,
      reason: 'overwrite',
      droppedAttributes: droppedAttributes(difference, table.syncMode),
    });
  }

  for (const difference of outcome.onlyRepository) {
    if (difference.repository === undefined) continue;
    writes.push({ key: difference.key, item: difference.repository, reason: 'create', droppedAttributes: [] });
  }

  return writes;
}

/**
 * Builds a plan for every table the comparison found drifted.
 *
 * Only `drifted` tables are planned. A table that could not be read, has no
 * file, or whose file carries a protected key is blocking, and planning a
 * write off an answer the run could not give is how a half-read comparison
 * turns into a write.
 *
 * @param outcomes - Every comparison outcome
 * @param tables - The declared tables, carrying key schema and write mode
 * @returns One plan per drifted table, in comparison order
 */
export function planSync(
  outcomes: ReadonlyArray<TableOutcome>,
  tables: ReadonlyArray<AnagraficaTable>,
): ReadonlyArray<TableSyncPlan> {
  const declared = new Map(tables.map((table) => [table.name, table]));
  const plans: TableSyncPlan[] = [];

  for (const outcome of outcomes) {
    if (outcome.status !== 'drifted') continue;

    const table = declared.get(outcome.table);
    if (table === undefined) continue;

    plans.push({
      table: outcome.table,
      account: outcome.account,
      profile: outcome.profile,
      keys: table.keys,
      syncMode: table.syncMode,
      writes: writesOf(outcome, table),
      untouched: outcome.onlyLive.length,
    });
  }

  return plans;
}

/**
 * Splits a wire-form item into its key and the attributes a merge would set.
 *
 * @param item - The item, in wire form
 * @param keys - Key attribute names
 * @returns The key and the rest
 * @throws Error when the item does not carry every key attribute
 */
export function splitKey(
  item: Record<string, unknown>,
  keys: ReadonlyArray<string>,
): { key: Record<string, unknown>; attributes: Record<string, unknown> } {
  // Keying it first rejects a missing or non-scalar key attribute with the
  // message the comparison already uses, instead of building an UpdateItem
  // whose Key is quietly short one attribute.
  itemKey(item, keys);

  const key: Record<string, unknown> = {};
  const attributes: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(item)) {
    if (keys.includes(name)) key[name] = value;
    else attributes[name] = value;
  }

  return { key, attributes };
}
