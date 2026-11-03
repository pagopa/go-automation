import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createRunId, decodeIun, deriveRowIdentifiers, resolveRowKey } from '../identifiers.js';

describe('identifiers', () => {
  it('creates run ids as yyyyMMdd-HHmmss-xxxx', () => {
    assert.match(createRunId(new Date('2026-11-03T10:04:05.000Z')), /^20261103-100405-[0-9a-f]{4}$/);
  });

  it('derives deterministic protocol number and token', () => {
    const ids = deriveRowIdentifiers('20261103-100405-ab12', 'S-01');
    assert.deepEqual(ids, {
      paProtocolNumber: 'GO-20261103-100405-ab12-S-01',
      idempotenceToken: '20261103-100405-ab12-S-01',
    });
    assert.deepEqual(deriveRowIdentifiers('20261103-100405-ab12', 'S-01'), ids);
    assert.equal(deriveRowIdentifiers('run', 'S-01', 'PROT-9').paProtocolNumber, 'PROT-9');
  });

  it('hashes non-ASCII row keys in the token only', () => {
    const ids = deriveRowIdentifiers('run', 'città-1');
    assert.equal(ids.paProtocolNumber, 'GO-run-città-1');
    assert.match(ids.idempotenceToken, /^run-[0-9a-f]{16}$/);
    assert.equal(deriveRowIdentifiers('run', 'città-1').idempotenceToken, ids.idempotenceToken);
  });

  it('resolves the row key', () => {
    assert.equal(resolveRowKey({ ID: ' 7 ' }, 'ID', 3), '7');
    assert.equal(resolveRowKey({ ID: '' }, 'ID', 3), 'r3');
    assert.equal(resolveRowKey({}, undefined, 0), 'r0');
  });

  it('decodes the IUN from the notification request id', () => {
    const iun = 'PAYK-MWDR-ZUAZ-202601-K-1';
    assert.equal(decodeIun(Buffer.from(iun).toString('base64')), iun);
    assert.equal(decodeIun(Buffer.from('not an iun').toString('base64')), undefined);
  });
});
