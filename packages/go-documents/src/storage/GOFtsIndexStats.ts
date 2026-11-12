/**
 * Aggregate statistics about a GOFtsIndex.
 */
export interface GOFtsIndexStats {
  /** Total number of documents in the index. */
  readonly documentCount: number;
  /** On-disk size of the database file in bytes (0 for `:memory:`). */
  readonly databaseSizeBytes: number;
  /** Path to the database file. */
  readonly databasePath: string;
  /** Tokenizer string used by the FTS5 table. */
  readonly tokenizer: string;
}
