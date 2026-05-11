/**
 * Generic FTS5-backed full-text index for use across go-automation scripts.
 *
 * Wraps `better-sqlite3` to expose a small, opinionated API for indexing and
 * searching text documents with optional metadata. Two search modes are
 * supported:
 *
 *  - `full-text`  → FTS5 MATCH with BM25 ranking and snippet().
 *  - `literal`    → case-insensitive substring scan over the indexed content,
 *                   useful when the FTS5 tokenizer would split a token (e.g.
 *                   UUIDs, IUNs, codes containing punctuation).
 *
 * The index also supports equality filters on metadata columns, opaque schema
 * versioning via `getSchemaVersion` / `setSchemaVersion`, and consumer-provided
 * custom tables via direct SQL execution through `getDatabase()` (escape hatch
 * for scripts that need bookkeeping beyond what GOFtsIndex provides).
 *
 * Storage layout (created on first open):
 *   <fts_table>                  → FTS5 virtual table with `id UNINDEXED` and `content`,
 *                                  plus one column per declared metadata field.
 *   <fts_table>_meta             → Side table for metadata lookup (id PRIMARY KEY).
 *   _go_fts_meta(key, value)     → Internal key/value store (versioning, tokenizer, …).
 *
 * @example
 * ```typescript
 * const index = new GOFtsIndex({
 *   databasePath: '/tmp/index.db',
 *   metadataColumns: ['source', 'category'],
 * });
 * await index.open();
 * index.upsert({ id: '1', content: 'hello world', metadata: { source: 'a', category: 'x' } });
 * const hits = index.search({ query: 'hello', limit: 10 });
 * await index.close();
 * ```
 */
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';

import type BetterSqliteDatabase from 'better-sqlite3';
import type { Database as BetterSqliteDatabaseInstance, Statement as BetterSqliteStatement } from 'better-sqlite3';

import { valueToString } from '../utils/GOValueToString.js';

import type { GOFtsIndexConfig } from './GOFtsIndexConfig.js';
import type { GOFtsIndexDocument } from './GOFtsIndexDocument.js';
import { GOFtsIndexSearchMode, type GOFtsIndexSearchModeValue } from './GOFtsIndexSearchMode.js';
import type { GOFtsIndexSearchOptions } from './GOFtsIndexSearchOptions.js';
import type { GOFtsIndexSearchResult } from './GOFtsIndexSearchResult.js';
import type { GOFtsIndexStats } from './GOFtsIndexStats.js';

// better-sqlite3 is published as CommonJS only, so use createRequire() to
// load it cleanly from this ESM module while still pulling type information
// from `@types/better-sqlite3`.
const requireCjs = createRequire(import.meta.url);

type DatabaseConstructor = typeof BetterSqliteDatabase;

/**
 * Cached transaction functions returned by `Database.transaction(...)`. We
 * only ever invoke them as plain callables; the `.default / .immediate /
 * .exclusive` overloads of better-sqlite3 are unused.
 */
type UpsertOneTxnFn = (doc: GOFtsIndexDocument) => void;
type UpsertManyTxnFn = (docs: ReadonlyArray<GOFtsIndexDocument>) => void;
type DeleteOneTxnFn = (id: string) => void;

const DEFAULT_TOKENIZER = 'unicode61 remove_diacritics 2';
const DEFAULT_FTS_TABLE_NAME = 'documents_fts';
const SCHEMA_VERSION_KEY = 'schema_version';
const TOKENIZER_KEY = 'tokenizer';
const DEFAULT_SEARCH_LIMIT = 50;
const DEFAULT_SNIPPET_TOKENS = 16;
const LITERAL_SNIPPET_BEFORE = 80;
const LITERAL_SNIPPET_LENGTH = 200;

/** Identifiers in dynamic SQL must match this pattern (defence in depth). */
const SAFE_IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * The tokenizer string is interpolated into the FTS5 `tokenize='…'` clause of
 * the `CREATE VIRTUAL TABLE` DDL. Single quotes are doubled before splicing,
 * but control characters and embedded NULs would still defeat that. Reject
 * any tokenizer that contains them: nothing legitimate ever does.
 */
// eslint-disable-next-line no-control-regex -- intentional: we explicitly reject control chars
const TOKENIZER_FORBIDDEN_RE = /[\x00-\x1f\x7f]/;

/**
 * Internal type narrowed by `assertOpen` — guarantees the database handle and
 * read-only prepared statements are present.
 */
interface OpenState {
  readonly database: BetterSqliteDatabaseInstance;
  readonly hasStmt: BetterSqliteStatement;
  readonly countStmt: BetterSqliteStatement;
  readonly getSchemaVersionStmt: BetterSqliteStatement;
}

/**
 * Internal canonical representation of a single filter clause: the column
 * name plus a boolean discriminator that switches the SQL between
 * `m.<col> = @filter_<col>` and `m.<col> IS NULL`. The list is sorted by
 * column name so the cache key (and the prepared SQL) is stable.
 */
interface FilterSpecEntry {
  readonly column: string;
  readonly isNull: boolean;
}

/**
 * Internal type narrowed by `assertWritable` — extends `OpenState` with the
 * write statements and the cached transaction functions.
 */
interface WritableState extends OpenState {
  readonly upsertContentStmt: BetterSqliteStatement;
  readonly upsertMetaStmt: BetterSqliteStatement;
  readonly deleteContentStmt: BetterSqliteStatement;
  readonly deleteMetaStmt: BetterSqliteStatement;
  readonly setSchemaVersionStmt: BetterSqliteStatement;
  readonly upsertOneTxn: UpsertOneTxnFn;
  readonly upsertManyTxn: UpsertManyTxnFn;
  readonly deleteOneTxn: DeleteOneTxnFn;
}

export class GOFtsIndex {
  private readonly databasePath: string;
  private readonly ftsTableName: string;
  private readonly metaTableName: string;
  private readonly metadataColumns: ReadonlyArray<string>;
  private readonly tokenizer: string;
  private readonly readonlyMode: boolean;

  private database: BetterSqliteDatabaseInstance | undefined;
  private upsertContentStmt: BetterSqliteStatement | undefined;
  private upsertMetaStmt: BetterSqliteStatement | undefined;
  private deleteContentStmt: BetterSqliteStatement | undefined;
  private deleteMetaStmt: BetterSqliteStatement | undefined;
  private hasStmt: BetterSqliteStatement | undefined;
  private countStmt: BetterSqliteStatement | undefined;
  private getSchemaVersionStmt: BetterSqliteStatement | undefined;
  private setSchemaVersionStmt: BetterSqliteStatement | undefined;
  private upsertOneTxn: UpsertOneTxnFn | undefined;
  private upsertManyTxn: UpsertManyTxnFn | undefined;
  private deleteOneTxn: DeleteOneTxnFn | undefined;

  /** Cache of prepared search statements keyed by `mode + filter signature`. */
  private readonly searchStmtCache: Map<string, BetterSqliteStatement> = new Map();

  constructor(config: GOFtsIndexConfig) {
    if (config.databasePath.length === 0) {
      throw new Error('GOFtsIndex: databasePath is required');
    }
    this.databasePath = config.databasePath;
    this.ftsTableName = config.ftsTableName ?? DEFAULT_FTS_TABLE_NAME;
    this.metaTableName = `${this.ftsTableName}_meta`;
    this.tokenizer = config.tokenizer ?? DEFAULT_TOKENIZER;
    if (TOKENIZER_FORBIDDEN_RE.test(this.tokenizer)) {
      throw new Error('GOFtsIndex: tokenizer must not contain control characters');
    }
    this.readonlyMode = config.readonly ?? false;
    this.metadataColumns = (config.metadataColumns ?? []).map((column) => {
      if (!SAFE_IDENTIFIER_RE.test(column)) {
        throw new Error(`GOFtsIndex: invalid metadata column name "${column}"`);
      }
      return column;
    });

    if (!SAFE_IDENTIFIER_RE.test(this.ftsTableName)) {
      throw new Error(`GOFtsIndex: invalid ftsTableName "${this.ftsTableName}"`);
    }
  }

  /**
   * Opens the database file and ensures the schema exists.
   *
   * Subsequent calls are no-ops. In writable mode, sets WAL journal mode for
   * concurrent readers + better crash safety.
   */
  public async open(): Promise<void> {
    if (this.database !== undefined) return;

    if (this.databasePath !== ':memory:') {
      const directory = path.dirname(this.databasePath);
      await fs.promises.mkdir(directory, { recursive: true });
    }

    const databaseCtor = requireCjs('better-sqlite3') as DatabaseConstructor;
    this.database = new databaseCtor(this.databasePath, { readonly: this.readonlyMode });

    if (!this.readonlyMode) {
      this.database.pragma('journal_mode = WAL');
      this.database.pragma('synchronous = NORMAL');
      this.database.pragma('foreign_keys = ON');
      this.ensureSchema();
    }
    this.prepareStatements();
  }

  /**
   * Closes the database, releasing the file lock and flushing the WAL.
   * Calling `close()` on an already-closed instance is a no-op.
   *
   * Returns a `Promise<void>` to keep the API symmetrical with `open()`,
   * even though no asynchronous I/O is performed.
   */
  public async close(): Promise<void> {
    if (this.database === undefined) return Promise.resolve();
    try {
      if (!this.readonlyMode) {
        this.database.pragma('wal_checkpoint(TRUNCATE)');
      }
    } catch {
      /* checkpoint is best-effort */
    }
    this.database.close();
    this.database = undefined;
    this.upsertContentStmt = undefined;
    this.upsertMetaStmt = undefined;
    this.deleteContentStmt = undefined;
    this.deleteMetaStmt = undefined;
    this.hasStmt = undefined;
    this.countStmt = undefined;
    this.getSchemaVersionStmt = undefined;
    this.setSchemaVersionStmt = undefined;
    this.upsertOneTxn = undefined;
    this.upsertManyTxn = undefined;
    this.deleteOneTxn = undefined;
    this.searchStmtCache.clear();
    return Promise.resolve();
  }

  /**
   * Inserts or replaces a single document atomically (FTS row + metadata row).
   * For bulk insertions prefer `upsertMany()` which fsyncs once.
   */
  public upsert(doc: GOFtsIndexDocument): void {
    const state = this.acquireWritable();
    state.upsertOneTxn(doc);
  }

  /**
   * Inserts or replaces a batch of documents in a single transaction.
   * Two orders of magnitude faster than calling `upsert()` in a loop because
   * the WAL is fsynced once instead of per-document.
   */
  public upsertMany(docs: ReadonlyArray<GOFtsIndexDocument>): void {
    const state = this.acquireWritable();
    if (docs.length === 0) return;
    state.upsertManyTxn(docs);
  }

  /**
   * Removes a document by id (no-op if missing).
   */
  public delete(id: string): void {
    const state = this.acquireWritable();
    state.deleteOneTxn(id);
  }

  /**
   * Returns true if a document with the given id exists.
   */
  public has(id: string): boolean {
    const state = this.acquireOpen();
    const row = state.hasStmt.get({ id }) as { id: string } | undefined;
    return row !== undefined;
  }

  /**
   * Returns the total document count.
   */
  public count(): number {
    const state = this.acquireOpen();
    const row = state.countStmt.get() as { c: number } | undefined;
    return row?.c ?? 0;
  }

  /**
   * Searches the index. See GOFtsIndexSearchOptions for parameters.
   */
  public search(options: GOFtsIndexSearchOptions): ReadonlyArray<GOFtsIndexSearchResult> {
    const state = this.acquireOpen();
    const mode: GOFtsIndexSearchModeValue = options.mode ?? GOFtsIndexSearchMode.FULL_TEXT;
    const limit = options.limit ?? DEFAULT_SEARCH_LIMIT;
    const filter = options.filter ?? {};

    // Short-circuit empty / whitespace-only queries: in full-text mode
    // `MATCH ''` raises `SQLITE_ERROR: fts5: syntax error`, and in literal
    // mode `instr(content, '')` returns > 0 for every row, accidentally
    // matching the whole index. Returning an empty list is the principle of
    // least surprise for callers that proxy user input.
    if (options.query.trim().length === 0) {
      return [];
    }

    const filterSpec = this.buildFilterSpec(filter);

    if (mode === GOFtsIndexSearchMode.FULL_TEXT) {
      return this.searchFullText(state, options, filter, filterSpec, limit);
    }
    return this.searchLiteral(state, options, filter, filterSpec, limit);
  }

  /**
   * Returns aggregate stats.
   */
  public stats(): GOFtsIndexStats {
    this.acquireOpen();
    const documentCount = this.count();
    let databaseSizeBytes = 0;
    if (this.databasePath !== ':memory:') {
      try {
        databaseSizeBytes = fs.statSync(this.databasePath).size;
      } catch {
        databaseSizeBytes = 0;
      }
    }
    return {
      documentCount,
      databaseSizeBytes,
      databasePath: this.databasePath,
      tokenizer: this.tokenizer,
    };
  }

  /**
   * Performs a WAL checkpoint (truncating the WAL file). No-op on read-only DB.
   */
  public checkpoint(): void {
    if (this.database === undefined || this.readonlyMode) return;
    try {
      this.database.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      /* best-effort */
    }
  }

  /**
   * Reads the schema version stored in `_go_fts_meta`. Returns 0 when not set.
   */
  public getSchemaVersion(): number {
    const state = this.acquireOpen();
    const row = state.getSchemaVersionStmt.get(SCHEMA_VERSION_KEY) as { value: string } | undefined;
    if (row === undefined) return 0;
    const parsed = Number.parseInt(row.value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /**
   * Persists the schema version into `_go_fts_meta`.
   */
  public setSchemaVersion(version: number): void {
    const state = this.acquireWritable();
    state.setSchemaVersionStmt.run(SCHEMA_VERSION_KEY, String(version));
  }

  /**
   * Direct access to the underlying better-sqlite3 Database instance. Use this
   * to declare additional script-specific tables. Avoid for portable code.
   */
  public getDatabase(): BetterSqliteDatabaseInstance {
    return this.acquireOpen().database;
  }

  // ── private ─────────────────────────────────────────────────────────

  private ensureSchema(): void {
    if (this.database === undefined) return;
    // Metadata columns live inside the FTS5 table but are marked UNINDEXED.
    // Rationale: a bare `<table> MATCH @query` matches across every indexed
    // column, so if metadata were indexed a search for "foo" could hit a row
    // whose `filename = "foo.pdf"` (or any other metadata field) even when
    // `content` does not contain the token — and the snippet (taken from
    // column 1 = `content`) would then not contain the match, producing
    // confusing UI results. Keeping metadata UNINDEXED restricts the MATCH
    // to `content` while still letting us project the columns in SELECT.
    const metadataColumnDefs =
      this.metadataColumns.length > 0
        ? `, ${this.metadataColumns.map((column) => `${column} UNINDEXED`).join(', ')}`
        : '';

    this.database.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ${this.ftsTableName}
      USING fts5(
        id UNINDEXED,
        content${metadataColumnDefs},
        tokenize = '${this.tokenizer.replace(/'/g, "''")}'
      );

      CREATE TABLE IF NOT EXISTS ${this.metaTableName} (
        id TEXT PRIMARY KEY${this.metadataColumns.map((column) => `, ${column} TEXT`).join('')}
      );

      CREATE TABLE IF NOT EXISTS _go_fts_meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    this.database
      .prepare(
        'INSERT INTO _go_fts_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      )
      .run(TOKENIZER_KEY, this.tokenizer);
  }

  private prepareStatements(): void {
    if (this.database === undefined) return;
    const db = this.database;

    // Read-only statements (always available).
    this.hasStmt = db.prepare(`SELECT id FROM ${this.metaTableName} WHERE id = @id`);
    this.countStmt = db.prepare(`SELECT COUNT(*) AS c FROM ${this.metaTableName}`);
    this.getSchemaVersionStmt = db.prepare('SELECT value FROM _go_fts_meta WHERE key = ?');

    if (this.readonlyMode) return;

    // Write statements.
    const ftsCols = ['id', 'content', ...this.metadataColumns];
    const ftsPlaceholders = ftsCols.map((column) => `@${column}`);
    const upsertContentStmt = db.prepare(
      `INSERT INTO ${this.ftsTableName}(${ftsCols.join(', ')}) VALUES(${ftsPlaceholders.join(', ')})`,
    );

    const metaCols = ['id', ...this.metadataColumns];
    const metaPlaceholders = metaCols.map((column) => `@${column}`);
    const metaUpdate = this.metadataColumns.map((column) => `${column} = excluded.${column}`).join(', ');
    const upsertMetaStmt = db.prepare(
      `INSERT INTO ${this.metaTableName}(${metaCols.join(', ')}) VALUES(${metaPlaceholders.join(', ')})
       ON CONFLICT(id) DO UPDATE SET ${metaUpdate.length > 0 ? metaUpdate : 'id = excluded.id'}`,
    );

    const deleteContentStmt = db.prepare(`DELETE FROM ${this.ftsTableName} WHERE id = @id`);
    const deleteMetaStmt = db.prepare(`DELETE FROM ${this.metaTableName} WHERE id = @id`);

    this.upsertContentStmt = upsertContentStmt;
    this.upsertMetaStmt = upsertMetaStmt;
    this.deleteContentStmt = deleteContentStmt;
    this.deleteMetaStmt = deleteMetaStmt;
    this.setSchemaVersionStmt = db.prepare(
      'INSERT INTO _go_fts_meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    );

    // Cache transaction functions once. better-sqlite3 nests transactions via
    // SAVEPOINT, so calling `upsertOneTxn` from inside `upsertManyTxn` is safe.
    const metadataColumns = this.metadataColumns;
    const upsertOne = (doc: GOFtsIndexDocument): void => {
      const metaValues: Record<string, unknown> = { id: doc.id };
      for (const column of metadataColumns) {
        metaValues[column] = doc.metadata?.[column] ?? null;
      }
      const contentValues: Record<string, unknown> = { ...metaValues, content: doc.content };
      deleteContentStmt.run({ id: doc.id });
      upsertContentStmt.run(contentValues);
      upsertMetaStmt.run(metaValues);
    };

    this.upsertOneTxn = db.transaction(upsertOne);
    this.upsertManyTxn = db.transaction((docs: ReadonlyArray<GOFtsIndexDocument>): void => {
      for (const doc of docs) upsertOne(doc);
    });
    this.deleteOneTxn = db.transaction((id: string): void => {
      deleteContentStmt.run({ id });
      deleteMetaStmt.run({ id });
    });
  }

  private metadataSelectColumns(alias: string): ReadonlyArray<string> {
    return this.metadataColumns.map((column) => `${alias}.${column} AS ${column}`);
  }

  /**
   * Validates and canonicalises the user-supplied filter map.
   * Returns a stable, sorted list of `(column, isNull)` entries — sort order
   * makes the cache key deterministic and the SQL clauses idempotent.
   *
   * Throws if a column is not declared in `metadataColumns`.
   */
  private buildFilterSpec(filter: Readonly<Record<string, string | number | null>>): ReadonlyArray<FilterSpecEntry> {
    const entries: FilterSpecEntry[] = [];
    for (const [column, value] of Object.entries(filter)) {
      if (!this.metadataColumns.includes(column)) {
        throw new Error(`GOFtsIndex: filter column "${column}" is not a declared metadataColumn`);
      }
      entries.push({ column, isNull: value === null });
    }
    entries.sort((a, b) => (a.column === b.column ? 0 : a.column < b.column ? -1 : 1));
    return entries;
  }

  private buildFilterClauses(filterSpec: ReadonlyArray<FilterSpecEntry>): ReadonlyArray<string> {
    return filterSpec.map((entry) =>
      entry.isNull ? `m.${entry.column} IS NULL` : `m.${entry.column} = @filter_${entry.column}`,
    );
  }

  private buildFilterParams(
    filter: Readonly<Record<string, string | number | null>>,
    filterSpec: ReadonlyArray<FilterSpecEntry>,
  ): Readonly<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    for (const entry of filterSpec) {
      if (entry.isNull) continue;
      const value = filter[entry.column];
      if (value !== null && value !== undefined) {
        out[`filter_${entry.column}`] = value;
      }
    }
    return out;
  }

  private buildSearchSql(mode: GOFtsIndexSearchModeValue, filterSpec: ReadonlyArray<FilterSpecEntry>): string {
    const filterClauses = this.buildFilterClauses(filterSpec);
    const whereExtra = filterClauses.length > 0 ? `AND ${filterClauses.join(' AND ')}` : '';
    const metaSelect = [...this.metadataSelectColumns('m')].join(', ');
    const selectCommonHead = ['fts.id AS id'];
    const selectMeta = metaSelect.length > 0 ? `, ${metaSelect}` : '';

    if (mode === GOFtsIndexSearchMode.FULL_TEXT) {
      return `
        SELECT
          ${selectCommonHead.join(', ')},
          bm25(${this.ftsTableName}) AS score,
          snippet(${this.ftsTableName}, 1, '«', '»', '…', @snippetTokens) AS snippet
          ${selectMeta}
        FROM ${this.ftsTableName} AS fts
        LEFT JOIN ${this.metaTableName} AS m ON m.id = fts.id
        WHERE ${this.ftsTableName} MATCH @query
          ${whereExtra}
        ORDER BY score
        LIMIT @limit
      `;
    }

    return `
      SELECT
        ${selectCommonHead.join(', ')},
        0 AS score,
        substr(
          fts.content,
          MAX(1, instr(lower(fts.content), lower(@needle)) - ${LITERAL_SNIPPET_BEFORE}),
          ${LITERAL_SNIPPET_LENGTH}
        ) AS snippet
        ${selectMeta}
      FROM ${this.ftsTableName} AS fts
      LEFT JOIN ${this.metaTableName} AS m ON m.id = fts.id
      WHERE instr(lower(fts.content), lower(@needle)) > 0
        ${whereExtra}
      LIMIT @limit
    `;
  }

  private getOrPrepareSearchStmt(
    state: OpenState,
    mode: GOFtsIndexSearchModeValue,
    filterSpec: ReadonlyArray<FilterSpecEntry>,
  ): BetterSqliteStatement {
    const signature = filterSpec.map((entry) => (entry.isNull ? `${entry.column}!` : entry.column)).join(',');
    const cacheKey = `${mode}|${signature}`;
    const cached = this.searchStmtCache.get(cacheKey);
    if (cached !== undefined) return cached;
    const stmt = state.database.prepare(this.buildSearchSql(mode, filterSpec));
    this.searchStmtCache.set(cacheKey, stmt);
    return stmt;
  }

  private searchFullText(
    state: OpenState,
    options: GOFtsIndexSearchOptions,
    filter: Readonly<Record<string, string | number | null>>,
    filterSpec: ReadonlyArray<FilterSpecEntry>,
    limit: number,
  ): ReadonlyArray<GOFtsIndexSearchResult> {
    const stmt = this.getOrPrepareSearchStmt(state, GOFtsIndexSearchMode.FULL_TEXT, filterSpec);
    const ftsQuery = options.rawFtsQuery === true ? options.query : escapeFtsQuery(options.query);
    const rows = stmt.all({
      query: ftsQuery,
      snippetTokens: options.snippetTokens ?? DEFAULT_SNIPPET_TOKENS,
      limit,
      ...this.buildFilterParams(filter, filterSpec),
    }) as ReadonlyArray<Record<string, unknown>>;
    return rows.map((row) => this.toSearchResult(row, /* literalScore */ false));
  }

  private searchLiteral(
    state: OpenState,
    options: GOFtsIndexSearchOptions,
    filter: Readonly<Record<string, string | number | null>>,
    filterSpec: ReadonlyArray<FilterSpecEntry>,
    limit: number,
  ): ReadonlyArray<GOFtsIndexSearchResult> {
    const stmt = this.getOrPrepareSearchStmt(state, GOFtsIndexSearchMode.LITERAL, filterSpec);
    const rows = stmt.all({
      needle: options.query,
      limit,
      ...this.buildFilterParams(filter, filterSpec),
    }) as ReadonlyArray<Record<string, unknown>>;
    return rows.map((row) => this.toSearchResult(row, /* literalScore */ true));
  }

  private toSearchResult(row: Record<string, unknown>, literalScore: boolean): GOFtsIndexSearchResult {
    const metadata: Record<string, string | number | null> = {};
    for (const column of this.metadataColumns) {
      const value = row[column];
      if (value === undefined || value === null) {
        metadata[column] = null;
      } else if (typeof value === 'string' || typeof value === 'number') {
        metadata[column] = value;
      } else {
        metadata[column] = valueToString(value, { bufferFormat: 'utf8' });
      }
    }
    const rawScore = row['score'];
    const score = literalScore ? 0 : typeof rawScore === 'number' ? rawScore : Number(rawScore ?? 0);
    return {
      id: valueToString(row['id'], { bufferFormat: 'utf8' }),
      score,
      snippet: valueToString(row['snippet'], { bufferFormat: 'utf8' }),
      metadata,
    };
  }

  /**
   * Returns a non-undefined bundle of the read-only handles. Throws if the
   * index has not been opened. Returning a bundle (instead of using
   * `asserts this is …`) sidesteps the TS limitation where intersection of
   * a class with private fields and an interface declaring the same field
   * names collapses to `never`.
   */
  private acquireOpen(): OpenState {
    if (
      this.database === undefined ||
      this.hasStmt === undefined ||
      this.countStmt === undefined ||
      this.getSchemaVersionStmt === undefined
    ) {
      throw new Error('GOFtsIndex: database is not open. Call open() first.');
    }
    return {
      database: this.database,
      hasStmt: this.hasStmt,
      countStmt: this.countStmt,
      getSchemaVersionStmt: this.getSchemaVersionStmt,
    };
  }

  /**
   * Returns a non-undefined bundle of the read+write handles. Throws if the
   * index is read-only or has not been opened.
   */
  private acquireWritable(): WritableState {
    if (this.readonlyMode) {
      throw new Error('GOFtsIndex: cannot mutate a read-only index.');
    }
    if (
      this.database === undefined ||
      this.upsertContentStmt === undefined ||
      this.upsertMetaStmt === undefined ||
      this.deleteContentStmt === undefined ||
      this.deleteMetaStmt === undefined ||
      this.hasStmt === undefined ||
      this.countStmt === undefined ||
      this.getSchemaVersionStmt === undefined ||
      this.setSchemaVersionStmt === undefined ||
      this.upsertOneTxn === undefined ||
      this.upsertManyTxn === undefined ||
      this.deleteOneTxn === undefined
    ) {
      throw new Error('GOFtsIndex: database is not open. Call open() first.');
    }
    return {
      database: this.database,
      hasStmt: this.hasStmt,
      countStmt: this.countStmt,
      getSchemaVersionStmt: this.getSchemaVersionStmt,
      upsertContentStmt: this.upsertContentStmt,
      upsertMetaStmt: this.upsertMetaStmt,
      deleteContentStmt: this.deleteContentStmt,
      deleteMetaStmt: this.deleteMetaStmt,
      setSchemaVersionStmt: this.setSchemaVersionStmt,
      upsertOneTxn: this.upsertOneTxn,
      upsertManyTxn: this.upsertManyTxn,
      deleteOneTxn: this.deleteOneTxn,
    };
  }
}

/**
 * Wraps every whitespace-separated token of a user query in double quotes,
 * escaping embedded `"` by doubling. Result is safe to feed into the FTS5
 * MATCH operator without triggering "fts5: syntax error" on apostrophes,
 * punctuation or accidental FTS5 operator keywords.
 *
 * Empty input returns an empty string (FTS5 will then return zero rows).
 */
function escapeFtsQuery(query: string): string {
  return query
    .split(/\s+/)
    .filter((token) => token.length > 0)
    .map((token) => `"${token.replace(/"/g, '""')}"`)
    .join(' ');
}
