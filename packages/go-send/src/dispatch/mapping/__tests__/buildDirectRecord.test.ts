import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { buildDirectRecord } from '../buildDirectRecord.js';
import type { CanonicalField } from '../CanonicalField.js';
import type { RecordBuildContext } from '../RecordBuildContext.js';

const SHA = 'XwRVE/PUU1TEi9r3Pmq2KEkmQ2yr7ge8jUDQKPL0e/Y=';
const IUN = 'PAYK-MWDR-ZUAZ-202601-K-1';
const CONTEXT: RecordBuildContext = { mode: 'direct', documentsDir: '/docs', sharedDocumentAvailable: false };

function validValues(): Map<CanonicalField, string> {
  return new Map<CanonicalField, string>([
    ['sender.taxId', '00000000001'],
    ['sender.denomination', 'Ente'],
    ['recipient.taxId', 'tsttst80a01h501u'],
    ['recipient.denomination', 'Destinatario'],
    ['physicalAddress.address', 'Via Milano 2'],
    ['physicalAddress.zip', '20100'],
    ['physicalAddress.municipality', 'Milano'],
    ['physicalAddress.province', 'MI'],
    ['product', 'RS'],
    ['documents.reference.key', 'PN_NOTIFICATION_ATTACHMENTS-1.pdf'],
    ['documents.reference.sha256', SHA],
    ['direct.aar.key', 'PN_AAR-1.pdf'],
    ['direct.aar.sha256', SHA],
  ]);
}

function build(values: ReadonlyMap<CanonicalField, string>): ReturnType<typeof buildDirectRecord> {
  return buildDirectRecord(0, 'TC-1', values, CONTEXT, 'REQ-1');
}

function issueKeys(result: ReturnType<typeof buildDirectRecord>): ReadonlyArray<string> {
  return result.ok ? [] : result.issues.map((issue) => `${issue.code}:${issue.field ?? ''}`).sort();
}

describe('buildDirectRecord', () => {
  it('builds a record with a PF recipient and an upper-cased tax id', () => {
    const result = build(validValues());
    assert.ok(result.ok);
    assert.deepEqual(result.record.recipient, { type: 'PF', taxId: 'TSTTST80A01H501U', denomination: 'Destinatario' });
    assert.equal(result.record.direct?.requestId, 'REQ-1');
    assert.equal(result.record.preset, undefined);
  });

  it('validates the recipient tax id as in e2e', () => {
    const values = validValues();
    values.set('recipient.taxId', 'NOT-A-CF');
    assert.deepEqual(issueKeys(build(values)), ['INVALID_FORMAT:recipient.taxId']);
  });

  it('validates preset.iun before it reaches the pn-ec request', () => {
    const values = validValues();
    values.set('preset.iun', 'not-an-iun');
    assert.deepEqual(issueKeys(build(values)), ['INVALID_FORMAT:preset.iun']);
    values.set('preset.iun', IUN);
    const result = build(values);
    assert.ok(result.ok);
    assert.equal(result.record.preset?.iun, IUN);
  });

  it('rejects a sender different from the environment one', () => {
    const result = buildDirectRecord(0, 'k', validValues(), { ...CONTEXT, environmentSenderTaxId: '2' }, 'R');
    assert.deepEqual(issueKeys(result), ['SENDER_MISMATCH:sender.taxId']);
  });

  describe('return address (all or nothing)', () => {
    const complete: ReadonlyArray<readonly [CanonicalField, string]> = [
      ['direct.returnAddress.name', 'Ente'],
      ['direct.returnAddress.address', 'Via Roma 1'],
      ['direct.returnAddress.zip', '00100'],
      ['direct.returnAddress.city', 'Roma'],
    ];

    it('is absent when no field is set', () => {
      const result = build(validValues());
      assert.ok(result.ok);
      assert.equal(result.record.direct?.returnAddress, undefined);
    });

    it('is read when complete', () => {
      const result = build(new Map([...validValues(), ...complete]));
      assert.ok(result.ok);
      assert.deepEqual(result.record.direct?.returnAddress, {
        name: 'Ente',
        address: 'Via Roma 1',
        zip: '00100',
        city: 'Roma',
      });
    });

    it('records an issue for every missing field when partial', () => {
      const result = build(new Map([...validValues(), ...complete.slice(0, 2)]));
      assert.deepEqual(issueKeys(result), [
        'MISSING_FIELD:direct.returnAddress.city',
        'MISSING_FIELD:direct.returnAddress.zip',
      ]);
    });
  });
});
