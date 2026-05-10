import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { GOFtsIndex } from '../GOFtsIndex.js';
import { GOFtsIndexSearchMode } from '../GOFtsIndexSearchMode.js';

async function makeTempDb(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'fts-index-'));
  return path.join(dir, 'index.db');
}

describe('GOFtsIndex', () => {
  it('rejects invalid identifiers', () => {
    assert.throws(
      () => new GOFtsIndex({ databasePath: ':memory:', metadataColumns: ['ok', 'bad-col'] }),
      /invalid metadata column name/,
    );
    assert.throws(() => new GOFtsIndex({ databasePath: ':memory:', ftsTableName: '1bad' }), /invalid ftsTableName/);
  });

  it('upserts and searches in full-text mode with BM25 ranking', async () => {
    const index = new GOFtsIndex({
      databasePath: ':memory:',
      metadataColumns: ['source'],
    });
    await index.open();

    index.upsert({ id: '1', content: 'Quick brown fox jumps over the lazy dog', metadata: { source: 'a' } });
    index.upsert({ id: '2', content: 'A lazy dog sleeps under a tree', metadata: { source: 'b' } });
    index.upsert({ id: '3', content: 'Completely unrelated text', metadata: { source: 'c' } });

    const hits = index.search({ query: 'lazy dog', limit: 10 });
    assert.strictEqual(hits.length, 2);
    const ids = hits.map((hit) => hit.id).sort();
    assert.deepStrictEqual(ids, ['1', '2']);
    assert.ok(hits[0]!.snippet.includes('«'));
    assert.ok(hits[0]!.score < 0); // BM25 returns negative-ish numbers; mainly we verify they're set

    await index.close();
  });

  it('supports literal mode for tokens with punctuation', async () => {
    const index = new GOFtsIndex({ databasePath: ':memory:' });
    await index.open();

    index.upsert({ id: 'a', content: 'IUN-ABCD-1234-5678 is the reference' });
    index.upsert({ id: 'b', content: 'no reference here' });

    const literalHits = index.search({
      query: 'IUN-ABCD-1234',
      mode: GOFtsIndexSearchMode.LITERAL,
    });
    assert.strictEqual(literalHits.length, 1);
    assert.strictEqual(literalHits[0]!.id, 'a');
    assert.strictEqual(literalHits[0]!.score, 0);
    assert.ok(literalHits[0]!.snippet.includes('IUN-ABCD-1234'));

    await index.close();
  });

  it('honours metadata filters', async () => {
    const index = new GOFtsIndex({
      databasePath: ':memory:',
      metadataColumns: ['project'],
    });
    await index.open();

    index.upsert({ id: '1', content: 'foo bar baz', metadata: { project: 'PN' } });
    index.upsert({ id: '2', content: 'foo bar baz', metadata: { project: 'SEND' } });

    const hits = index.search({ query: 'foo', filter: { project: 'PN' } });
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0]!.id, '1');
    assert.strictEqual(hits[0]!.metadata['project'], 'PN');

    await index.close();
  });

  it('throws when filtering on undeclared metadata columns', async () => {
    const index = new GOFtsIndex({ databasePath: ':memory:' });
    await index.open();
    index.upsert({ id: '1', content: 'hello' });
    assert.throws(() => index.search({ query: 'hello', filter: { unknown: 'value' } }), /metadataColumn/);
    await index.close();
  });

  it('persists to disk and reopens', async () => {
    const dbPath = await makeTempDb();
    try {
      const index = new GOFtsIndex({ databasePath: dbPath, metadataColumns: ['k'] });
      await index.open();
      index.upsert({ id: 'x', content: 'persist me', metadata: { k: 'v' } });
      assert.strictEqual(index.has('x'), true);
      assert.strictEqual(index.count(), 1);
      await index.close();

      const reopened = new GOFtsIndex({ databasePath: dbPath, metadataColumns: ['k'] });
      await reopened.open();
      assert.strictEqual(reopened.has('x'), true);
      const hits = reopened.search({ query: 'persist' });
      assert.strictEqual(hits.length, 1);
      assert.strictEqual(hits[0]!.metadata['k'], 'v');
      await reopened.close();
    } finally {
      await fs.rm(path.dirname(dbPath), { recursive: true, force: true });
    }
  });

  it('delete removes documents', async () => {
    const index = new GOFtsIndex({ databasePath: ':memory:' });
    await index.open();
    index.upsert({ id: 'gone', content: 'deleteme' });
    assert.strictEqual(index.has('gone'), true);
    index.delete('gone');
    assert.strictEqual(index.has('gone'), false);
    await index.close();
  });

  it('schema version round-trip', async () => {
    const index = new GOFtsIndex({ databasePath: ':memory:' });
    await index.open();
    assert.strictEqual(index.getSchemaVersion(), 0);
    index.setSchemaVersion(3);
    assert.strictEqual(index.getSchemaVersion(), 3);
    await index.close();
  });

  it('readonly mode rejects writes', async () => {
    const dbPath = await makeTempDb();
    try {
      const writable = new GOFtsIndex({ databasePath: dbPath });
      await writable.open();
      writable.upsert({ id: '1', content: 'hello' });
      await writable.close();

      const readonly = new GOFtsIndex({ databasePath: dbPath, readonly: true });
      await readonly.open();
      assert.throws(() => readonly.upsert({ id: '2', content: 'nope' }), /read-only/);
      assert.strictEqual(readonly.has('1'), true);
      await readonly.close();
    } finally {
      await fs.rm(path.dirname(dbPath), { recursive: true, force: true });
    }
  });

  // ── F17 — additional coverage ───────────────────────────────────────

  it('open() is idempotent (double open is a no-op)', async () => {
    const index = new GOFtsIndex({ databasePath: ':memory:' });
    await index.open();
    await index.open();
    index.upsert({ id: '1', content: 'hello' });
    assert.strictEqual(index.count(), 1);
    await index.close();
  });

  it('close() is idempotent (double close is a no-op)', async () => {
    const index = new GOFtsIndex({ databasePath: ':memory:' });
    await index.open();
    await index.close();
    await index.close();
  });

  it('throws a clear error when used after close()', async () => {
    const index = new GOFtsIndex({ databasePath: ':memory:' });
    await index.open();
    await index.close();
    assert.throws(() => index.has('x'), /not open/);
    assert.throws(() => index.count(), /not open/);
    assert.throws(() => index.search({ query: 'hello' }), /not open/);
    assert.throws(() => index.upsert({ id: '1', content: 'x' }), /not open/);
  });

  it('upsert overwrites the same id (no duplicate row, snippet reflects new content)', async () => {
    const index = new GOFtsIndex({ databasePath: ':memory:' });
    await index.open();

    index.upsert({ id: 'doc', content: 'first version of the content' });
    index.upsert({ id: 'doc', content: 'second version of the content' });

    assert.strictEqual(index.count(), 1);
    const hits = index.search({ query: 'second' });
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0]!.id, 'doc');

    const stale = index.search({ query: 'first' });
    assert.strictEqual(stale.length, 0);

    await index.close();
  });

  it('upsertMany commits a batch in a single transaction', async () => {
    const index = new GOFtsIndex({ databasePath: ':memory:' });
    await index.open();

    const docs = Array.from({ length: 100 }, (_, i) => ({
      id: `doc-${i}`,
      content: `content number ${i} contains the keyword orchestration`,
    }));
    index.upsertMany(docs);

    assert.strictEqual(index.count(), 100);
    const hits = index.search({ query: 'orchestration', limit: 1000 });
    assert.strictEqual(hits.length, 100);

    // Empty batch is a no-op.
    index.upsertMany([]);
    assert.strictEqual(index.count(), 100);

    await index.close();
  });

  it('snippet markers wrap the matched token in full-text mode', async () => {
    const index = new GOFtsIndex({ databasePath: ':memory:' });
    await index.open();
    index.upsert({ id: '1', content: 'before keyword after' });
    const hits = index.search({ query: 'keyword' });
    assert.strictEqual(hits.length, 1);
    assert.match(hits[0]!.snippet, /«keyword»/);
    await index.close();
  });

  it('escapes unsafe FTS5 query characters by default (no SQLite syntax error)', async () => {
    const index = new GOFtsIndex({ databasePath: ':memory:' });
    await index.open();
    index.upsert({ id: '1', content: "what's up doc" });
    // These would all crash with `fts5: syntax error` if forwarded raw.
    assert.doesNotThrow(() => index.search({ query: "what's" }));
    assert.doesNotThrow(() => index.search({ query: '"unbalanced' }));
    assert.doesNotThrow(() => index.search({ query: 'hello AND OR NEAR' }));
    const hits = index.search({ query: "what's" });
    assert.strictEqual(hits.length, 1);
    await index.close();
  });

  it('rawFtsQuery=true forwards FTS5 syntax untouched', async () => {
    const index = new GOFtsIndex({ databasePath: ':memory:' });
    await index.open();
    index.upsert({ id: '1', content: 'apple banana cherry' });
    index.upsert({ id: '2', content: 'mango durian' });

    // Prefix `app*` is FTS5-only syntax; with default escaping it would be
    // quoted into a literal `"app*"` token and would match nothing.
    const hits = index.search({ query: 'app*', rawFtsQuery: true });
    assert.strictEqual(hits.length, 1);
    assert.strictEqual(hits[0]!.id, '1');

    await index.close();
  });

  it('filters on null metadata via IS NULL', async () => {
    const index = new GOFtsIndex({ databasePath: ':memory:', metadataColumns: ['source'] });
    await index.open();
    index.upsert({ id: '1', content: 'one', metadata: { source: 'A' } });
    index.upsert({ id: '2', content: 'two' }); // no metadata → NULL
    index.upsert({ id: '3', content: 'three', metadata: { source: null } });

    const namedSource = index.search({ query: 'one', filter: { source: 'A' } });
    assert.strictEqual(namedSource.length, 1);
    assert.strictEqual(namedSource[0]!.id, '1');

    const nullSource = index.search({ query: 'two OR three', rawFtsQuery: true, filter: { source: null } });
    assert.strictEqual(nullSource.length, 2);
    const ids = nullSource.map((hit) => hit.id).sort();
    assert.deepStrictEqual(ids, ['2', '3']);

    await index.close();
  });

  it('preserves numeric metadata values (round-trips as string due to TEXT column affinity)', async () => {
    const index = new GOFtsIndex({ databasePath: ':memory:', metadataColumns: ['priority'] });
    await index.open();
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

    await index.close();
  });

  it('stats() reports document count, tokenizer and (on disk) a positive size', async () => {
    const dbPath = await makeTempDb();
    try {
      const index = new GOFtsIndex({ databasePath: dbPath });
      await index.open();
      index.upsert({ id: '1', content: 'hello world' });
      const stats = index.stats();
      assert.strictEqual(stats.documentCount, 1);
      assert.strictEqual(stats.databasePath, dbPath);
      assert.strictEqual(stats.tokenizer, 'unicode61 remove_diacritics 2');
      assert.ok(stats.databaseSizeBytes > 0);
      await index.close();
    } finally {
      await fs.rm(path.dirname(dbPath), { recursive: true, force: true });
    }
  });

  it('checkpoint() is a no-op smoke test', async () => {
    const index = new GOFtsIndex({ databasePath: ':memory:' });
    await index.open();
    index.upsert({ id: '1', content: 'hello' });
    assert.doesNotThrow(() => index.checkpoint());
    await index.close();
    // Checkpoint after close is also a no-op.
    assert.doesNotThrow(() => index.checkpoint());
  });

  it('getDatabase() exposes the raw handle for custom side-tables', async () => {
    const index = new GOFtsIndex({ databasePath: ':memory:' });
    await index.open();

    const db = index.getDatabase();
    db.exec('CREATE TABLE side (k TEXT PRIMARY KEY, v TEXT NOT NULL)');
    db.prepare('INSERT INTO side(k, v) VALUES(?, ?)').run('hello', 'world');
    const row = db.prepare('SELECT v FROM side WHERE k = ?').get('hello') as { v: string } | undefined;
    assert.strictEqual(row?.v, 'world');

    await index.close();
  });

  it('rejects tokenizers containing control characters', () => {
    assert.throws(
      () => new GOFtsIndex({ databasePath: ':memory:', tokenizer: 'unicode61\nDROP TABLE x' }),
      /control characters/,
    );
  });
});
