/**
 * Test dello snapshot prima della scrittura.
 *
 * Una `PutRequest` sostituisce l'oggetto intero e nessuno scrive il valore
 * precedente da qualche parte: lo snapshot e' l'unica copia di cio' che sta per
 * essere sovrascritto, e senza di lui non si scrive.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';

import type { SyncWrite, TableSyncPlan } from '../libs/planSync.js';
import { snapshotPlans } from '../libs/snapshotPlans.js';

import { fakeScript, s } from './fixtures.js';

/** A plan with the given writes. */
function plan(table: string, writes: ReadonlyArray<SyncWrite>): TableSyncPlan {
  return {
    table,
    account: 'confinfo',
    profile: 'send-confinfo-test',
    keys: ['cxId'],
    syncMode: 'replace',
    writes,
    untouched: 0,
  };
}

/** Reads an NDJSON snapshot back. */
async function readLines(file: string): Promise<unknown[]> {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- percorso costruito dalla mkdtemp di questo test.
  const text = await fs.readFile(file, 'utf8');
  return text
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => JSON.parse(line) as unknown);
}

describe('snapshotPlans', () => {
  it('saves the live item of every overwrite, in wire form, one per line', async () => {
    const { script, directory } = fakeScript();
    const live = { cxId: s('a'), count: { N: '1.0' }, old: s('x') };

    const snapshots = await snapshotPlans(script, [
      plan('pn-EcAnagrafica', [
        { key: 'a', item: { cxId: s('a') }, reason: 'overwrite', live, droppedAttributes: ['count', 'old'] },
      ]),
    ]);

    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0]?.path, path.join(directory, 'pre-sync', 'pn-EcAnagrafica.json'));
    assert.equal(snapshots[0]?.items, 1);
    // Not unmarshalled: {"N":"1.0"} must come back as it went in.
    assert.deepEqual(await readLines(snapshots[0]?.path ?? ''), [live]);
  });

  it('saves nothing for a create, which has no previous value to lose', async () => {
    const { script } = fakeScript();

    const snapshots = await snapshotPlans(script, [
      plan('pn-EcAnagrafica', [
        { key: 'a', item: { cxId: s('a') }, reason: 'create', live: undefined, droppedAttributes: [] },
      ]),
    ]);

    assert.deepEqual(snapshots, []);
  });

  it('writes one file per table and skips a table that only creates', async () => {
    const { script } = fakeScript();
    const overwrite = (key: string): SyncWrite => ({
      key,
      item: { cxId: s(key) },
      reason: 'overwrite',
      live: { cxId: s(key), old: s('x') },
      droppedAttributes: ['old'],
    });

    const snapshots = await snapshotPlans(script, [
      plan('pn-A', [overwrite('1'), overwrite('2')]),
      plan('pn-B', [{ key: 'c', item: { cxId: s('c') }, reason: 'create', live: undefined, droppedAttributes: [] }]),
      plan('pn-C', [overwrite('3')]),
    ]);

    assert.deepEqual(
      snapshots.map((snapshot) => [snapshot.table, snapshot.items]),
      [
        ['pn-A', 2],
        ['pn-C', 1],
      ],
    );
  });

  it('throws naming the table when it cannot write, so the caller sends nothing', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'send-sync-snapshot-'));
    const blocker = path.join(root, 'file');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- percorso costruito dalla mkdtemp di questo test.
    await fs.writeFile(blocker, 'not a directory', 'utf8');
    // The output directory sits under a regular file, so it can never be created.
    const { script } = fakeScript(path.join(blocker, 'outputs'));

    await assert.rejects(
      async () =>
        await snapshotPlans(script, [
          plan('pn-EcAnagrafica', [
            { key: 'a', item: { cxId: s('a') }, reason: 'overwrite', live: { cxId: s('a') }, droppedAttributes: [] },
          ]),
        ]),
      /Could not save the pre-write snapshot of pn-EcAnagrafica.*Nothing was written/s,
    );
  });
});
