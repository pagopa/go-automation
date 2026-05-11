/**
 * Configuration for GOFtsIndex.
 */
export interface GOFtsIndexConfig {
  /**
   * Absolute path to the SQLite database file. The directory is created if missing.
   * Pass `:memory:` for an in-memory index (useful for tests).
   */
  readonly databasePath: string;

  /**
   * Name of the FTS5 virtual table. Defaults to 'documents_fts'.
   */
  readonly ftsTableName?: string;

  /**
   * Additional metadata columns stored alongside the document.
   * They are persisted in a sibling table and joined on lookup.
   * Pass an empty array (or omit) for content-only indexes.
   */
  readonly metadataColumns?: ReadonlyArray<string>;

  /**
   * FTS5 tokenizer string. Defaults to 'unicode61 remove_diacritics 2'.
   */
  readonly tokenizer?: string;

  /**
   * Open the database in read-only mode. Defaults to false.
   */
  readonly readonly?: boolean;
}
