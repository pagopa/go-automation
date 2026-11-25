/**
 * Test della mappa delle tabelle.
 *
 * La mappa e' l'unica cosa che dice **quale account possiede una tabella** e
 * qual e' il suo schema di chiave: nessuno dei due e' deducibile dal path del
 * file. Se e' sbagliata, il confronto legge l'account sbagliato o confronta
 * sulla chiave sbagliata, e in entrambi i casi risponde con sicurezza.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import { loadTableMap } from '../libs/loadTableMap.js';

import { TABLES_PATH } from './fixtures.js';

/** Writes a table map to a temporary file and loads it. */
async function loadFrom(content: unknown): Promise<ReturnType<typeof loadTableMap>> {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'send-sync-anagrafica-'));
  const file = path.join(directory, 'tables.json');
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- percorso costruito dalla mkdtemp di questo test.
  await fs.writeFile(file, JSON.stringify(content), 'utf8');
  try {
    return await loadTableMap(file);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

describe('the shipped table map', () => {
  it('declares every table on an account that exists', async () => {
    const tables = await loadTableMap(TABLES_PATH);

    assert.ok(tables.length > 0);
    for (const table of tables) {
      assert.ok(['core', 'confinfo'].includes(table.account), `${table.name} is on '${table.account}'`);
      assert.ok(table.keys.length >= 1 && table.keys.length <= 2, `${table.name} has a bad key schema`);
    }
  });

  it('splits the estate across both accounts, which is why profiles are plural', async () => {
    const tables = await loadTableMap(TABLES_PATH);

    assert.ok(tables.some((table) => table.account === 'core'));
    assert.ok(tables.some((table) => table.account === 'confinfo'));
  });

  it('names a key attribute for every protected key', async () => {
    const tables = await loadTableMap(TABLES_PATH);
    const guarded = tables.filter((table) => table.protectedKey !== undefined);

    assert.ok(guarded.length > 0, 'the estate does have protected items');
    for (const table of guarded) {
      assert.ok(table.keys.includes(table.protectedKey?.name ?? ''), `${table.name}`);
    }
  });
});

describe('loadTableMap', () => {
  it('refuses a map with no tables', async () => {
    await assert.rejects(loadFrom({ tables: {} }), /declares no table/);
  });

  it('refuses a file that is not a map', async () => {
    await assert.rejects(loadFrom({ nope: 1 }), /'tables' must be an object/);
  });

  it('refuses an account that is neither core nor confinfo', async () => {
    await assert.rejects(loadFrom({ tables: { t: { account: 'interop', keys: ['k'] } } }), /must be one of/);
  });

  it('refuses a missing key schema', async () => {
    await assert.rejects(loadFrom({ tables: { t: { account: 'core' } } }), /must be a non-empty array/);
  });

  it('refuses a third key attribute, which DynamoDB has no room for', async () => {
    await assert.rejects(
      loadFrom({ tables: { t: { account: 'core', keys: ['a', 'b', 'c'] } } }),
      /a DynamoDB key has at most 2/,
    );
  });

  it('refuses a protected key that is not part of the key schema', async () => {
    // Otherwise it could never be matched, and the item would be reported as
    // drift forever while looking configured.
    await assert.rejects(
      loadFrom({ tables: { t: { account: 'core', keys: ['a'], protectedKey: { name: 'b', values: ['x'] } } } }),
      /is not one of the key attributes/,
    );
  });

  it('reports every problem at once rather than one run at a time', async () => {
    await assert.rejects(
      loadFrom({ tables: { a: { account: 'nope', keys: [] }, b: { account: 'core' } } }),
      (error: Error) => error.message.split('\n').length > 2,
    );
  });

  it('says so when the map is not there at all', async () => {
    await assert.rejects(loadTableMap('/nowhere/tables.json'), /is missing/);
  });

  it('reads the environments a table is defined in, and treats none as all of them', async () => {
    const tables = await loadFrom({
      tables: {
        'pn-A': { account: 'core', keys: ['k'], environments: ['uat', 'prod'] },
        'pn-B': { account: 'core', keys: ['k'], environments: [] },
        'pn-C': { account: 'core', keys: ['k'] },
      },
    });

    assert.deepEqual(
      tables.map((table) => table.environments),
      [['uat', 'prod'], [], undefined],
    );
  });

  it('refuses environments that are not a list of names', async () => {
    await assert.rejects(
      async () => await loadFrom({ tables: { 'pn-A': { account: 'core', keys: ['k'], environments: 'uat' } } }),
      /environments must be an array of environment names/,
    );
    await assert.rejects(
      async () => await loadFrom({ tables: { 'pn-A': { account: 'core', keys: ['k'], environments: ['uat', ''] } } }),
      /environments must be an array/,
    );
  });

  it('defaults a table with no syncMode to replace, as the reference does', async () => {
    const [table] = await loadFrom({ tables: { 'pn-PaperZone': { account: 'core', keys: ['countryIt'] } } });

    assert.equal(table?.syncMode, 'replace');
  });

  it('reads the merge mode the reference calls SyncMode UPDATE', async () => {
    const [table] = await loadFrom({
      tables: { 'pn-AuthJwtIssuers': { account: 'core', keys: ['hashKey', 'sortKey'], syncMode: 'merge' } },
    });

    assert.equal(table?.syncMode, 'merge');
  });

  it('refuses a write mode it does not implement instead of falling back', async () => {
    await assert.rejects(
      loadFrom({ tables: { a: { account: 'core', keys: ['k'], syncMode: 'UPDATE' } } }),
      /syncMode must be one of replace, merge/,
    );
  });

  it('keeps the shipped map in step with the reference on the one merge table', async () => {
    // pn-AuthJwtIssuers is the single table the reference gives SyncMode
    // UPDATE. Putting it through a replace would strip the attributes its
    // file does not carry.
    const tables = await loadTableMap(TABLES_PATH);
    const merging = tables.filter((table) => table.syncMode === 'merge').map((table) => table.name);

    assert.deepEqual(merging, ['pn-AuthJwtIssuers']);
  });
});
