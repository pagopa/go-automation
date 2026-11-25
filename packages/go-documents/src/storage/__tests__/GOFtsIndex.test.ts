import { after, before, describe, it } from 'node:test';
import type { TestContext } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { GOFtsIndex } from '../GOFtsIndex.js';
import type { GOFtsIndexConfig } from '../GOFtsIndexConfig.js';
import { GOFtsIndexSearchMode } from '../GOFtsIndexSearchMode.js';

/** Opens an index (in memory unless a path is given), closed when the test ends. */
async function openIndex(t: TestContext, config: Partial<GOFtsIndexConfig> = {}): Promise<GOFtsIndex> {
  const index = new GOFtsIndex({ databasePath: ':memory:', ...config });
  await index.open();
  t.after(async () => index.close());
  return index;
}

describe('GOFtsIndex', () => {
  let tempDir = '';
  let dbCounter = 0;

  before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fts-index-'));
  });

  after(async () => fs.rm(tempDir, { recursive: true, force: true }));

  /** A database path no other test uses. */
  function tempDbPath(): string {
    dbCounter += 1;
    return path.join(tempDir, `index-${dbCounter}.db`);
  }

  it('rejects invalid identifiers and tokenizers', () => {
    const cases: ReadonlyArray<readonly [Partial<GOFtsIndexConfig>, RegExp]> = [
      [{ metadataColumns: ['ok', 'bad-col'] }, /invalid metadata column name/],
      [{ ftsTableName: '1bad' }, /invalid ftsTableName/],
      [{ tokenizer: 'unicode61\nDROP TABLE x' }, /control characters/],
    ];

    for (const [config, message] of cases) {
      assert.throws(() => new GOFtsIndex({ databasePath: ':memory:', ...config }), message);
    }
  });

  it('upserts and searches in full-text mode with BM25 ranking', async (t) => {
    const index = await openIndex(t, { metadataColumns: ['source'] });

    index.upsert({ id: '1', content: 'Quick brown fox jumps over the lazy dog', metadata: { source: 'a' } });
    index.upsert({ id: '2', content: 'A lazy dog sleeps under a tree', metadata: { source: 'b' } });
    index.upsert({ id: '3', content: 'Completely unrelated text', metadata: { source: 'c' } });

    const hits = index.search({ query: 'lazy dog', limit: 10 });
    assert.deepStrictEqual(hits.map((hit) => hit.id).sort(), ['1', '2']);
    assert.ok(hits[0]!.snippet.includes('«'));
    assert.ok(hits[0]!.score < 0); // BM25 returns negative-ish numbers; mainly we verify they're set
  });

  it('supports literal mode for tokens with punctuation', async (t) => {
    const index = await openIndex(t);

    index.upsert({ id: 'a', content: 'IUN-ABCD-1234-5678 is the reference' });
    index.upsert({ id: 'b', content: 'no reference here' });

    const literalHits = index.search({ query: 'IUN-ABCD-1234', mode: GOFtsIndexSearchMode.LITERAL });
    assert.strictEqual(literalHits.length, 1);
    assert.strictEqual(literalHits[0]!.id, 'a');
    assert.strictEqual(literalHits[0]!.score, 0);
    assert.ok(literalHits[0]!.snippet.includes('IUN-ABCD-1234'));
  });

  it('honours metadata filters', async (t) => {
    const index = await openIndex(t, { metadataColumns: ['project'] });

    index.upsert({ id: '1', content: 'foo bar baz', metadata: { project: 'PN' } });
    index.upsert({ id: '2', content: 'foo bar baz', metadata: { project: 'SEND' } });

    const hits = index.search({ query: 'foo', filter: { project: 'PN' } });
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0]!.id, '1');
    assert.strictEqual(hits[0]!.metadata['project'], 'PN');
  });

  it('throws when filtering on undeclared metadata columns', async (t) => {
    const index = await openIndex(t);
    index.upsert({ id: '1', content: 'hello' });
    assert.throws(() => index.search({ query: 'hello', filter: { unknown: 'value' } }), /metadataColumn/);
  });

  it('persists to disk and reopens', async (t) => {
    const dbPath = tempDbPath();
    const index = new GOFtsIndex({ databasePath: dbPath, metadataColumns: ['k'] });
    await index.open();
    index.upsert({ id: 'x', content: 'persist me', metadata: { k: 'v' } });
    assert.strictEqual(index.has('x'), true);
    assert.strictEqual(index.count(), 1);
    await index.close();

    const reopened = await openIndex(t, { databasePath: dbPath, metadataColumns: ['k'] });
    assert.strictEqual(reopened.has('x'), true);
    const hits = reopened.search({ query: 'persist' });
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0]!.metadata['k'], 'v');
  });

  it('delete removes documents', async (t) => {
    const index = await openIndex(t);
    index.upsert({ id: 'gone', content: 'deleteme' });
    assert.strictEqual(index.has('gone'), true);
    index.delete('gone');
    assert.strictEqual(index.has('gone'), false);
  });

  it('schema version round-trip', async (t) => {
    const index = await openIndex(t);
    assert.strictEqual(index.getSchemaVersion(), 0);
    index.setSchemaVersion(3);
    assert.strictEqual(index.getSchemaVersion(), 3);
  });

  it('readonly mode rejects writes', async (t) => {
    const dbPath = tempDbPath();
    const writable = new GOFtsIndex({ databasePath: dbPath });
    await writable.open();
    writable.upsert({ id: '1', content: 'hello' });
    await writable.close();

    const readonly = await openIndex(t, { databasePath: dbPath, readonly: true });
    assert.throws(() => readonly.upsert({ id: '2', content: 'nope' }), /read-only/);
    assert.strictEqual(readonly.has('1'), true);
    // Checkpoint is skipped on a read-only index.
    assert.doesNotThrow(() => readonly.checkpoint());
  });

  it('open() and close() are idempotent, and checkpoint() is a no-op when open or closed', async () => {
    const index = new GOFtsIndex({ databasePath: ':memory:' });
    await index.open();
    await index.open();
    index.upsert({ id: '1', content: 'hello' });
    assert.strictEqual(index.count(), 1);
    assert.doesNotThrow(() => index.checkpoint());
    await index.close();
    await index.close();
    assert.doesNotThrow(() => index.checkpoint());
  });

  it('throws a clear error when used after close()', async () => {
    const index = new GOFtsIndex({ databasePath: ':memory:' });
    await index.open();
    await index.close();
    assert.throws(() => index.has('x'), /not open/);
    assert.throws(() => index.count(), /not open/);
    assert.throws(() => index.search({ query: 'hello' }), /not open/);
    assert.throws(() => index.upsert({ id: '1', content: 'x' }), /not open/);
    assert.throws(() => index.getDatabase(), /not open/);
  });

  it('upsert overwrites the same id (no duplicate row, snippet reflects new content)', async (t) => {
    const index = await openIndex(t);

    index.upsert({ id: 'doc', content: 'first version of the content' });
    index.upsert({ id: 'doc', content: 'second version of the content' });

    assert.strictEqual(index.count(), 1);
    const hits = index.search({ query: 'second' });
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0]!.id, 'doc');
    assert.strictEqual(index.search({ query: 'first' }).length, 0);
  });

  it('upsertMany commits a batch in a single transaction', async (t) => {
    const index = await openIndex(t);

    const docs = Array.from({ length: 100 }, (_, i) => ({
      id: `doc-${i}`,
      content: `content number ${i} contains the keyword orchestration`,
    }));
    index.upsertMany(docs);

    assert.strictEqual(index.count(), 100);
    assert.strictEqual(index.search({ query: 'orchestration', limit: 1000 }).length, 100);

    // Empty batch is a no-op.
    index.upsertMany([]);
    assert.strictEqual(index.count(), 100);
  });

  it('escapes unsafe FTS5 query characters by default (no SQLite syntax error)', async (t) => {
    const index = await openIndex(t);
    index.upsert({ id: '1', content: "what's up doc" });
    // These would all crash with `fts5: syntax error` if forwarded raw.
    assert.doesNotThrow(() => index.search({ query: '"unbalanced' }));
    assert.doesNotThrow(() => index.search({ query: 'hello AND OR NEAR' }));
    assert.strictEqual(index.search({ query: "what's" }).length, 1);
  });

  it('rawFtsQuery=true forwards FTS5 syntax untouched', async (t) => {
    const index = await openIndex(t);
    index.upsert({ id: '1', content: 'apple banana cherry' });
    index.upsert({ id: '2', content: 'mango durian' });

    // Prefix `app*` is FTS5-only syntax; with default escaping it would be
    // quoted into a literal `"app*"` token and would match nothing.
    const hits = index.search({ query: 'app*', rawFtsQuery: true });
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0]!.id, '1');
  });

  it('filters on null metadata via IS NULL', async (t) => {
    const index = await openIndex(t, { metadataColumns: ['source'] });
    index.upsert({ id: '1', content: 'one', metadata: { source: 'A' } });
    index.upsert({ id: '2', content: 'two' }); // no metadata → NULL
    index.upsert({ id: '3', content: 'three', metadata: { source: null } });

    const namedSource = index.search({ query: 'one', filter: { source: 'A' } });
    assert.strictEqual(namedSource.length, 1);
    assert.strictEqual(namedSource[0]!.id, '1');

    const nullSource = index.search({ query: 'two OR three', rawFtsQuery: true, filter: { source: null } });
    assert.deepStrictEqual(nullSource.map((hit) => hit.id).sort(), ['2', '3']);
  });

  it('preserves numeric metadata values (round-trips as string due to TEXT column affinity)', async (t) => {
    const index = await openIndex(t, { metadataColumns: ['priority'] });
    index.upsert({ id: '1', content: 'task one', metadata: { priority: 3 } });
    index.upsert({ id: '2', content: 'task two', metadata: { priority: 1 } });

    const hits = index.search({ query: 'task', filter: { priority: 3 } });
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0]!.id, '1');
    // better-sqlite3 binds JS numbers as REAL (double precision), so the
    // TEXT-affinity column round-trips as '3' or '3.0' depending on the
    // underlying driver. Both are acceptable as long as the numeric value
    // is preserved.
    const priority = hits[0]!.metadata['priority'];
    assert.notStrictEqual(priority, null);
    assert.strictEqual(Number.parseFloat(String(priority)), 3);
  });

  it('stats() reports document count, tokenizer and (on disk) a positive size', async (t) => {
    const dbPath = tempDbPath();
    const index = await openIndex(t, { databasePath: dbPath });
    index.upsert({ id: '1', content: 'hello world' });

    const stats = index.stats();
    assert.strictEqual(stats.documentCount, 1);
    assert.strictEqual(stats.databasePath, dbPath);
    assert.strictEqual(stats.tokenizer, 'unicode61 remove_diacritics 2');
    assert.ok(stats.databaseSizeBytes > 0);
  });

  it('short-circuits empty / whitespace-only queries to an empty result list', async (t) => {
    const index = await openIndex(t);
    index.upsert({ id: '1', content: 'alpha beta gamma' });
    index.upsert({ id: '2', content: 'delta epsilon' });

    // Full-text mode would otherwise crash with `fts5: syntax error near ""`;
    // literal mode would otherwise match every row via `instr(content, '') > 0`.
    for (const mode of [GOFtsIndexSearchMode.FULL_TEXT, GOFtsIndexSearchMode.LITERAL]) {
      for (const query of ['', '   \t\n']) {
        assert.deepStrictEqual(index.search({ query, mode }), [], `${mode} ${JSON.stringify(query)}`);
      }
    }
  });

  it('full-text MATCH only searches `content`, with the matched token marked in the snippet', async (t) => {
    // Regression guard: when metadata columns were INDEXED, a `MATCH 'tpp'`
    // would also hit rows whose `filename = 'tpp-config'` even with empty
    // content, producing a misleading snippet. Marking metadata as UNINDEXED
    // restricts the match to `content` only.
    const index = await openIndex(t, { metadataColumns: ['filename'] });

    // Row whose CONTENT does not mention the token, but whose FILENAME does.
    index.upsert({ id: 'a', content: 'unrelated body about animals', metadata: { filename: 'tpp-config.pdf' } });
    // Row whose CONTENT mentions the token explicitly.
    index.upsert({ id: 'b', content: 'this body talks about tpp', metadata: { filename: 'notes.txt' } });

    const hits = index.search({ query: 'tpp' });
    assert.deepStrictEqual(
      hits.map((hit) => hit.id),
      ['b'],
      'only the content-matching row should be returned',
    );
    assert.match(hits[0]!.snippet, /«tpp»/);
  });
});
