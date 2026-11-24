/**
 * Test della pianificazione delle scritture.
 *
 * Il test che conta davvero e' quello sugli attributi cancellati. Un
 * `PutRequest` sostituisce l'item intero, quindi un attributo che la tabella
 * ha e il file no sparisce **senza comparire in nessun diff di item**: e'
 * esattamente la forma del difetto gia' registrato su `pn-EcAnagrafica.json`,
 * dove lo stesso attributo e' scritto `SESEventsList` nel file e
 * `sesEventsList` nella tabella.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { droppedAttributes, planSync, splitKey } from '../libs/planSync.js';
import type { TableOutcome } from '../types/index.js';

import { makeTable, s } from './fixtures.js';

/** Un esito di confronto, con i valori di default che i test non usano. */
function outcome(overrides: Partial<TableOutcome> = {}): TableOutcome {
  return {
    table: 'pn-EcAnagrafica',
    account: 'confinfo',
    profile: 'send-confinfo-test',
    status: 'drifted',
    detail: '',
    different: [],
    onlyLive: [],
    onlyRepository: [],
    protectedItems: [],
    protectedInFile: [],
    ...overrides,
  };
}

describe('droppedAttributes', () => {
  it('names the attributes a replace would delete from the live item', () => {
    const difference = {
      key: 'pn-test',
      live: { cxId: s('pn-test'), sesEventsList: s('a'), kept: s('b') },
      repository: { cxId: s('pn-test'), SESEventsList: s('a'), kept: s('b') },
    };

    assert.deepEqual([...droppedAttributes(difference, 'replace')], ['sesEventsList']);
  });

  it('names nothing in merge mode, where unlisted attributes are left alone', () => {
    const difference = {
      key: 'pn-test',
      live: { cxId: s('pn-test'), sesEventsList: s('a') },
      repository: { cxId: s('pn-test'), SESEventsList: s('a') },
    };

    assert.deepEqual([...droppedAttributes(difference, 'merge')], []);
  });

  it('names nothing when the table has no such item to lose attributes from', () => {
    const difference = { key: 'new', live: undefined, repository: { cxId: s('new') } };

    assert.deepEqual([...droppedAttributes(difference, 'replace')], []);
  });

  it('does not call an attribute dropped when only its value changed', () => {
    const difference = {
      key: 'pn-test',
      live: { cxId: s('pn-test'), endpoint: s('old') },
      repository: { cxId: s('pn-test'), endpoint: s('new') },
    };

    assert.deepEqual([...droppedAttributes(difference, 'replace')], []);
  });
});

describe('planSync', () => {
  const table = makeTable();

  it('writes a differing item as an overwrite and a missing one as a create', () => {
    const plans = planSync(
      [
        outcome({
          different: [{ key: 'a', live: { cxId: s('a') }, repository: { cxId: s('a'), x: s('1') } }],
          onlyRepository: [{ key: 'b', live: undefined, repository: { cxId: s('b') } }],
        }),
      ],
      [table],
    );

    assert.equal(plans.length, 1);
    assert.deepEqual(
      plans[0]?.writes.map((write) => [write.key, write.reason]),
      [
        ['a', 'overwrite'],
        ['b', 'create'],
      ],
    );
  });

  it('carries the attributes the write would delete onto the plan', () => {
    const plans = planSync(
      [
        outcome({
          different: [
            {
              key: 'pn-test',
              live: { cxId: s('pn-test'), sesEventsList: s('a') },
              repository: { cxId: s('pn-test'), SESEventsList: s('a') },
            },
          ],
        }),
      ],
      [table],
    );

    assert.deepEqual([...(plans[0]?.writes[0]?.droppedAttributes ?? [])], ['sesEventsList']);
  });

  it('writes the repository item, never the live one', () => {
    const plans = planSync(
      [outcome({ different: [{ key: 'a', live: { cxId: s('a') }, repository: { cxId: s('a'), x: s('1') } }] })],
      [table],
    );

    assert.deepEqual(plans[0]?.writes[0]?.item, { cxId: s('a'), x: s('1') });
  });

  it('never plans a write for an item only the table holds', () => {
    // Every request is a put, so a live-only item is not removed and must not
    // be counted as something the sync deals with.
    const plans = planSync(
      [outcome({ onlyLive: [{ key: 'ghost', live: { cxId: s('ghost') }, repository: undefined }] })],
      [table],
    );

    assert.deepEqual([...(plans[0]?.writes ?? [])], []);
    assert.equal(plans[0]?.untouched, 1);
  });

  it('plans nothing for a table the comparison could not answer for', () => {
    for (const status of ['failed', 'missing-file', 'unconfigured', 'protected-in-file', 'aligned'] as const) {
      const plans = planSync(
        [
          outcome({
            status,
            different: [{ key: 'a', live: { cxId: s('a') }, repository: { cxId: s('a'), x: s('1') } }],
          }),
        ],
        [table],
      );

      assert.deepEqual([...plans], [], `${status} must not be planned`);
    }
  });

  it('carries the key schema and the write mode of the table it plans', () => {
    const merge = makeTable({ name: 'pn-AuthJwtIssuers', keys: ['hashKey', 'sortKey'], syncMode: 'merge' });
    const plans = planSync([outcome({ table: 'pn-AuthJwtIssuers' })], [merge]);

    assert.equal(plans[0]?.syncMode, 'merge');
    assert.deepEqual([...(plans[0]?.keys ?? [])], ['hashKey', 'sortKey']);
  });

  it('skips a table the map does not declare rather than guessing its key schema', () => {
    assert.deepEqual([...planSync([outcome({ table: 'pn-Unknown' })], [table])], []);
  });
});

describe('splitKey', () => {
  it('separates the key attributes from the ones an update would set', () => {
    const { key, attributes } = splitKey({ hashKey: s('i'), sortKey: s('CFG'), url: s('x') }, ['hashKey', 'sortKey']);

    assert.deepEqual(key, { hashKey: s('i'), sortKey: s('CFG') });
    assert.deepEqual(attributes, { url: s('x') });
  });

  it('refuses an item missing a key attribute instead of addressing the wrong row', () => {
    assert.throws(() => splitKey({ hashKey: s('i'), url: s('x') }, ['hashKey', 'sortKey']), /sortKey/);
  });
});
