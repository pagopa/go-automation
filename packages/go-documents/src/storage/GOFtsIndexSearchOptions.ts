import type { GOFtsIndexSearchModeValue } from './GOFtsIndexSearchMode.js';

/**
 * Options for GOFtsIndex.search.
 */
export interface GOFtsIndexSearchOptions {
  /** Query string. Interpreted differently depending on `mode`. */
  readonly query: string;

  /** Search mode. Defaults to 'full-text'. */
  readonly mode?: GOFtsIndexSearchModeValue;

  /** Maximum number of results. Defaults to 50. */
  readonly limit?: number;

  /**
   * Number of context tokens for the FTS5 snippet() function.
   * Ignored in literal mode. Defaults to 16.
   */
  readonly snippetTokens?: number;

  /**
   * Equality filters on metadata columns (AND-ed together).
   * Keys MUST match metadata columns declared in GOFtsIndexConfig.
   *
   * Use `null` to match rows where the metadata column is NULL — this emits
   * a SQL `IS NULL` clause, not `= NULL`.
   */
  readonly filter?: Readonly<Record<string, string | number | null>>;

  /**
   * When true (default false) the `query` is passed through untouched to the
   * FTS5 MATCH operator, allowing the caller to use raw FTS5 syntax (`AND`,
   * `OR`, `NEAR/N`, prefix `*`, phrase `"…"`).
   *
   * When false, every whitespace-separated token of `query` is wrapped in
   * double-quotes (with embedded `"` escaped) so apostrophes, punctuation and
   * accidental FTS5 operators do not cause SQLite syntax errors. This is the
   * safe default for user-supplied query strings. Ignored in literal mode.
   */
  readonly rawFtsQuery?: boolean;
}
