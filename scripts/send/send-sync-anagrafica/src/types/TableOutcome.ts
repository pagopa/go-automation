/** What the comparison concluded about one table. */
export type TableStatus =
  /** Repository and table agree on every item. */
  | 'aligned'
  /** They disagree, which is the answer a comparison run asks for. */
  | 'drifted'
  /** The table map says the table is not defined in this environment, so nothing was read. */
  | 'not-defined'
  /** The table is configured but its file is not in the repository. */
  | 'missing-file'
  /** A file exists that configs/tables.json names nowhere. */
  | 'unconfigured'
  /** The file declares an item the table map marks as protected. */
  | 'protected-in-file'
  /** The table could not be read, or the file could not be parsed. */
  | 'failed';

/** One item the two sides disagree about. */
export interface ItemDifference {
  /** The item's key, joined in key-schema order. */
  readonly key: string;

  /** The item as the table holds it, when it is there. */
  readonly live: Record<string, unknown> | undefined;

  /** The item as the repository declares it, when it is there. */
  readonly repository: Record<string, unknown> | undefined;
}

/** The comparison of one table. */
export interface TableOutcome {
  /** Table name. */
  readonly table: string;

  /** Account the table was read from. */
  readonly account: string;

  /** Profile used to read it. */
  readonly profile: string;

  /** Verdict. */
  readonly status: TableStatus;

  /** One line explaining the verdict. */
  readonly detail: string;

  /** Items present on both sides but not equal. */
  readonly different: ReadonlyArray<ItemDifference>;

  /** Items the table holds and the repository does not declare. */
  readonly onlyLive: ReadonlyArray<ItemDifference>;

  /** Items the repository declares and the table does not hold. */
  readonly onlyRepository: ReadonlyArray<ItemDifference>;

  /** Live-only items that a protected key explains, which are not drift. */
  readonly protectedItems: ReadonlyArray<ItemDifference>;

  /** Items the file declares that a protected key says it must not. */
  readonly protectedInFile: ReadonlyArray<ItemDifference>;
}
