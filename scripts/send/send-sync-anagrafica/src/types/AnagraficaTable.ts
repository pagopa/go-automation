/**
 * How a table's items are written back.
 *
 * `replace` sends a `PutRequest`, which substitutes the whole item: an
 * attribute the file omits is deleted. `merge` sends an `UpdateItem` that sets
 * only the attributes the file names and leaves the rest alone. The reference
 * calls the second one `SyncMode: "UPDATE"` and gives it to exactly one table;
 * reading it as a detail and putting every table through a replace would
 * silently strip attributes off that one.
 */
export type SyncMode = 'replace' | 'merge';

/** Items a table keeps live on purpose, which no configuration file declares. */
export interface ProtectedKey {
  /** Key attribute carrying the protected value. */
  readonly name: string;

  /** Values that are expected to exist live and nowhere else. */
  readonly values: ReadonlyArray<string>;
}

/** One anagrafica table, as configs/tables.json declares it. */
export interface AnagraficaTable {
  /** Table name, which is also the name of its configuration file. */
  readonly name: string;

  /** Account owning the table. */
  readonly account: string;

  /** Key schema, in order: one attribute for a simple key, two for a composite. */
  readonly keys: ReadonlyArray<string>;

  /** Items deliberately absent from the repository, when the table has any. */
  readonly protectedKey: ProtectedKey | undefined;

  /** How a sync writes this table's items. */
  readonly syncMode: SyncMode;
}
