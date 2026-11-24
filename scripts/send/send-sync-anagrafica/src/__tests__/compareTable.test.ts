/**
 * Test del confronto a quattro categorie.
 *
 * Tre comportamenti sono il motivo per cui questo file esiste, e tutti e tre
 * sono differenze rispetto al `compareExecutor` di `anagrafica_upsert`:
 *
 * - una chiave composita va confrontata su **entrambi** gli attributi;
 * - una chiave non stringa, o assente, deve far fallire rumorosamente invece
 *   di far combaciare item diversi;
 * - un item coperto da `protectedKey` e' atteso solo live, non e' drift.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { compareTable } from '../libs/compareTable.js';

import { makeTable, s } from './fixtures.js';

describe('compareTable', () => {
  it('calls a table aligned when both sides hold the same items', () => {
    const items = [{ cxId: s('pn-delivery'), sqsName: s('a') }];

    const result = compareTable(makeTable(), items, [{ sqsName: s('a'), cxId: s('pn-delivery') }]);

    assert.deepEqual([...result.different], []);
    assert.deepEqual([...result.onlyLive], []);
    assert.deepEqual([...result.onlyRepository], []);
  });

  it('ignores attribute order, which the two sides really do differ in', () => {
    // The live pn-EcAnagrafica starts with sqsArn where the file starts with
    // sqsName: comparing serialised text would call every item different.
    const live = [{ sqsArn: s('x'), cxId: s('pn-delivery'), sqsName: s('a') }];
    const repository = [{ cxId: s('pn-delivery'), sqsName: s('a'), sqsArn: s('x') }];

    assert.deepEqual([...compareTable(makeTable(), live, repository).different], []);
  });

  it('reports an item both sides hold but disagree about', () => {
    const live = [{ cxId: s('pn-delivery'), sqsName: s('live') }];
    const repository = [{ cxId: s('pn-delivery'), sqsName: s('repo') }];

    const result = compareTable(makeTable(), live, repository);

    assert.equal(result.different.length, 1);
    assert.equal(result.different[0]?.key, 'pn-delivery');
  });

  it('separates the two directions of absence', () => {
    const live = [{ cxId: s('only-live') }];
    const repository = [{ cxId: s('only-repo') }];

    const result = compareTable(makeTable(), live, repository);

    assert.equal(result.onlyLive[0]?.key, 'only-live');
    assert.equal(result.onlyRepository[0]?.key, 'only-repo');
  });

  it('matches a composite key on both attributes', () => {
    const table = makeTable({ name: 'pn-SmStates', keys: ['processClientId', 'currStatus'] });
    const live = [
      { processClientId: s('PEC'), currStatus: s('_any_'), targetStatus: s('a') },
      { processClientId: s('PEC'), currStatus: s('booked'), targetStatus: s('b') },
    ];
    const repository = [
      { processClientId: s('PEC'), currStatus: s('_any_'), targetStatus: s('a') },
      { processClientId: s('PEC'), currStatus: s('booked'), targetStatus: s('b') },
    ];

    const result = compareTable(table, live, repository);

    assert.deepEqual([...result.different], []);
    assert.deepEqual([...result.onlyLive], []);
  });

  it('does not collapse two items that share only their partition key', () => {
    // Matching on the partition key alone would make these one item and hide
    // the difference between them.
    const table = makeTable({ name: 'pn-SmStates', keys: ['processClientId', 'currStatus'] });
    const live = [{ processClientId: s('PEC'), currStatus: s('_any_'), targetStatus: s('live') }];
    const repository = [{ processClientId: s('PEC'), currStatus: s('booked'), targetStatus: s('repo') }];

    const result = compareTable(table, live, repository);

    assert.equal(result.different.length, 0);
    assert.equal(result.onlyLive.length, 1);
    assert.equal(result.onlyRepository.length, 1);
  });

  it('treats a protected item as expected live-only rather than drift', () => {
    // pn-cons-000 really is in the live pn-EcAnagrafica and in no file. The
    // reference reports it as drift on every single run.
    const table = makeTable({ protectedKey: { name: 'cxId', values: ['pn-cons-000'] } });
    const live = [{ cxId: s('pn-cons-000') }, { cxId: s('pn-delivery') }];
    const repository = [{ cxId: s('pn-delivery') }];

    const result = compareTable(table, live, repository);

    assert.deepEqual([...result.onlyLive], []);
    assert.equal(result.protectedItems[0]?.key, 'pn-cons-000');
  });

  it('still reports a live-only item the protected key does not cover', () => {
    const table = makeTable({ protectedKey: { name: 'cxId', values: ['pn-cons-000'] } });
    const live = [{ cxId: s('pn-cons-000') }, { cxId: s('stray') }];

    const result = compareTable(table, live, []);

    assert.equal(result.onlyLive.length, 1);
    assert.equal(result.onlyLive[0]?.key, 'stray');
  });

  it('refuses an item with no key attribute instead of matching it to anything', () => {
    // The reference reads item[key].S, which throws here — but only after an
    // arbitrary amount of the run has already happened.
    assert.throws(() => compareTable(makeTable(), [{ sqsName: s('a') }], []), /carries no key attribute 'cxId'/);
  });

  it('refuses a key attribute that is not a scalar', () => {
    // Reading `.S` off a map gives undefined on both sides, and
    // `undefined == undefined` makes every item match the first candidate.
    assert.throws(() => compareTable(makeTable(), [{ cxId: { M: { a: s('b') } } }], []), /cannot be a DynamoDB key/);
  });

  it('keeps a numeric key apart from the string that looks like it', () => {
    const live = [{ cxId: { N: '1' } }];
    const repository = [{ cxId: s('1') }];

    const result = compareTable(makeTable(), live, repository);

    assert.equal(result.different.length, 0, 'these are two different items, not one that differs');
    assert.equal(result.onlyLive.length, 1);
    assert.equal(result.onlyRepository.length, 1);
  });

  it('refuses a file that declares the same key twice', () => {
    assert.throws(
      () => compareTable(makeTable(), [], [{ cxId: s('dup') }, { cxId: s('dup') }]),
      /the file declares the key 'dup' more than once/,
    );
  });

  it('compares an empty table against an empty file without complaint', () => {
    const result = compareTable(makeTable(), [], []);

    assert.deepEqual([...result.different], []);
    assert.deepEqual([...result.onlyRepository], []);
  });

  it('reports every repository item when the table is empty', () => {
    // An empty scan must not read as "aligned": that is what a denied read
    // would look like if failures were not kept separate.
    const result = compareTable(makeTable(), [], [{ cxId: s('a') }, { cxId: s('b') }]);

    assert.equal(result.onlyRepository.length, 2);
  });

  it('reports a file that declares a protected item, whatever the diff says', () => {
    // The reference checks this in a separate `validate` command that
    // `compare` never runs, so today a file could claim pn-cons-000 and the
    // comparison would call the table aligned.
    const table = makeTable({ protectedKey: { name: 'cxId', values: ['pn-cons-000'] } });

    const result = compareTable(table, [{ cxId: s('pn-cons-000') }], [{ cxId: s('pn-cons-000') }]);

    assert.equal(result.protectedInFile.length, 1);
    assert.equal(result.protectedInFile[0]?.key, 'pn-cons-000');
    assert.deepEqual([...result.different], []);
  });

  it('keeps the two directions of a protected key apart', () => {
    // Live-only is the expected state and not drift; the same value in the
    // file is a defect. Collapsing them would either hide one or cry wolf.
    const table = makeTable({ protectedKey: { name: 'cxId', values: ['pn-cons-000'] } });

    const result = compareTable(table, [{ cxId: s('pn-cons-000') }], []);

    assert.equal(result.protectedItems.length, 1);
    assert.deepEqual([...result.protectedInFile], []);
    assert.deepEqual([...result.onlyLive], []);
  });

  it('says nothing about protection on a table that declares no protected key', () => {
    const result = compareTable(makeTable(), [{ cxId: s('pn-cons-000') }], [{ cxId: s('pn-cons-000') }]);

    assert.deepEqual([...result.protectedInFile], []);
    assert.deepEqual([...result.protectedItems], []);
  });
});
