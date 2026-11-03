import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { InputRow } from '../../input/InputRow.js';
import { BUILT_IN_PROFILES } from '../builtInProfiles.js';
import { buildRecord } from '../buildRecord.js';
import type { CanonicalField } from '../CanonicalField.js';
import { mapRow, mergeFieldValues } from '../mapRow.js';
import { parseMappingProfile } from '../parseMappingProfile.js';
import { QA_TEST_PROFILE } from '../profiles/qaTestProfile.js';
import { RecordFactory } from '../RecordFactory.js';
import type { RecordBuildContext } from '../RecordBuildContext.js';

const CONTEXT: RecordBuildContext = { documentsDir: '/docs', sharedDocumentAvailable: true };

const QA_ROW: Readonly<Record<string, string>> = {
  ID_Scenario: 'S-01',
  Scenario: 'Test AR',
  Destinatario: 'RSSMRA80A01H501U',
  Denomination: 'Mario Rossi',
  'Indirizzo PEC': '',
  CAP: '00100',
  Provincia: 'RM',
  Citta: 'Roma',
  Stato: 'ITALIA',
  Indirizzo: 'Via Roma 1',
  Sender: 'Comune di Test',
  'Tax ID': '00000000001',
  physicalCommunicationType: 'REGISTERED_LETTER_890',
};

function values(entries: ReadonlyArray<readonly [CanonicalField, string]>): ReadonlyMap<CanonicalField, string> {
  return new Map(entries);
}

function validValues(): Map<CanonicalField, string> {
  return new Map(mapRow(QA_ROW, QA_TEST_PROFILE));
}

describe('parseMappingProfile', () => {
  it('accepts the built-in profiles', () => {
    for (const profile of BUILT_IN_PROFILES.values()) {
      assert.deepEqual(parseMappingProfile(JSON.parse(JSON.stringify(profile)), profile.name), profile);
    }
  });

  it('rejects unknown keys, fields and transforms', () => {
    assert.throws(
      () => parseMappingProfile({ name: 'x', columns: { a: 'subject' }, extra: 1 }, 'p'),
      /unknown key "extra"/,
    );
    assert.throws(
      () => parseMappingProfile({ name: 'x', columns: { a: 'sujbect' } }, 'p'),
      /unknown canonical field "sujbect"/,
    );
    assert.throws(
      () =>
        parseMappingProfile({ name: 'x', columns: { a: 'subject' }, transforms: { subject: [{ op: 'eval' }] } }, 'p'),
      /unknown transform/,
    );
    assert.throws(
      () =>
        parseMappingProfile({ name: 'x', columns: { a: 'subject' }, transforms: { subject: [{ op: 'map' }] } }, 'p'),
      /values/,
    );
  });
});

describe('mapRow', () => {
  it('maps columns, trims, drops empty values and applies transforms', () => {
    const mapped = mapRow(QA_ROW, QA_TEST_PROFILE);
    assert.equal(mapped.get('recipient.taxId'), 'RSSMRA80A01H501U');
    assert.equal(mapped.get('physicalAddress.foreignState'), undefined, 'ITALIA is emptied');
    assert.equal(mapped.get('digitalDomicile.address'), undefined);
    assert.equal(mapped.get('digitalDomicile.type'), undefined, 'no PEC → no type');
    assert.equal(mapped.get('product'), '890', 'mapped from REGISTERED_LETTER_890');
  });

  it('takes the first non-empty column when several map the same field', () => {
    const mapped = mapRow({ ...QA_ROW, Prodotto: 'AR' }, QA_TEST_PROFILE);
    assert.equal(mapped.get('product'), 'AR');
  });

  it('sets PEC when a digital address is present', () => {
    const mapped = mapRow({ ...QA_ROW, 'Indirizzo PEC': 'mario@pec.it' }, QA_TEST_PROFILE);
    assert.equal(mapped.get('digitalDomicile.type'), 'PEC');
  });

  it('merges layers by precedence: row > CLI > environment', () => {
    const merged = mergeFieldValues(
      values([['notificationOptions.group', 'row']]),
      values([
        ['notificationOptions.group', 'cli'],
        ['subject', 'cli'],
      ]),
      values([
        ['subject', 'env'],
        ['abstract', 'env'],
      ]),
    );
    assert.equal(merged.get('notificationOptions.group'), 'row');
    assert.equal(merged.get('subject'), 'cli');
    assert.equal(merged.get('abstract'), 'env');
  });
});

describe('buildRecord', () => {
  it('builds a valid record with neutral defaults', () => {
    const result = buildRecord(0, 'S-01', validValues(), CONTEXT);
    assert.ok(result.ok);
    assert.equal(result.record.product, '890');
    assert.equal(result.record.recipient.type, 'PF');
    assert.equal(result.record.options.taxonomyCode, '010202N');
    assert.equal(result.record.options.notificationFeePolicy, 'FLAT_RATE');
    assert.deepEqual(result.record.documents, { kind: 'shared' });
    assert.equal(result.record.physicalAddress.foreignState, undefined);
  });

  it('collects every issue of an invalid row', () => {
    const row = validValues();
    row.delete('subject');
    row.set('physicalAddress.zip', '1234');
    row.set('product', 'RS');
    row.set('notificationOptions.taxonomyCode', 'abc');
    const result = buildRecord(0, 'S-01', row, CONTEXT);
    assert.ok(!result.ok);
    assert.deepEqual(result.issues.map((issue) => `${issue.code}:${issue.field ?? ''}`).sort(), [
      'INVALID_FORMAT:notificationOptions.taxonomyCode',
      'INVALID_FORMAT:physicalAddress.zip',
      'MISSING_FIELD:subject',
      'UNSUPPORTED_PRODUCT:product',
    ]);
  });

  it('rejects a sender different from the environment one', () => {
    const result = buildRecord(0, 'S-01', validValues(), { ...CONTEXT, environmentSenderTaxId: '00000000002' });
    assert.ok(!result.ok);
    assert.equal(result.issues[0]?.code, 'SENDER_MISMATCH');
  });

  it('requires a document when there is no shared document', () => {
    const result = buildRecord(0, 'S-01', validValues(), { ...CONTEXT, sharedDocumentAvailable: false });
    assert.ok(!result.ok);
    assert.equal(result.issues[0]?.code, 'NO_DOCUMENTS');
  });

  it('resolves document sources in precedence order', () => {
    const row = validValues();
    row.set('documents.files', 'a.pdf|sub/b.pdf');
    row.set('documents.titles', 'Atto');
    row.set('documents.reference.key', 'KEY');
    const files = buildRecord(0, 'k', row, CONTEXT);
    assert.ok(files.ok);
    assert.deepEqual(files.record.documents, {
      kind: 'rowFiles',
      files: [
        { path: '/docs/a.pdf', title: 'Atto' },
        { path: '/docs/sub/b.pdf', title: 'b' },
      ],
    });

    row.set('documents.pratica', 'P1');
    const pratica = buildRecord(0, 'k', row, { ...CONTEXT, knownPratiche: new Set(['P1']) });
    assert.ok(pratica.ok);
    assert.deepEqual(pratica.record.documents, { kind: 'pratica', pratica: 'P1' });

    const unknown = buildRecord(0, 'k', row, { ...CONTEXT, knownPratiche: new Set(['P2']) });
    assert.ok(!unknown.ok);
    assert.equal(unknown.issues[0]?.code, 'UNKNOWN_PRATICA');
  });

  it('validates a document reference', () => {
    const row = validValues();
    row.set('documents.reference.key', 'PN_NOTIFICATION_ATTACHMENTS-1.pdf');
    row.set('documents.reference.versionToken', 'v1');
    row.set('documents.reference.sha256', 'short');
    const result = buildRecord(0, 'k', row, CONTEXT);
    assert.ok(!result.ok);
    assert.equal(result.issues[0]?.field, 'documents.reference.sha256');
  });

  it('accepts a foreign address without an Italian ZIP', () => {
    const row = validValues();
    row.set('physicalAddress.foreignState', 'FRANCIA');
    row.set('physicalAddress.zip', '75001 X');
    assert.ok(buildRecord(0, 'k', row, CONTEXT).ok);
  });
});

describe('RecordFactory', () => {
  it('uses the key column of the profile and falls back to r<rowIndex>', () => {
    const factory = new RecordFactory({
      profile: QA_TEST_PROFILE,
      cliValues: new Map(),
      environmentValues: new Map(),
      context: CONTEXT,
    });
    const row = (rowIndex: number, raw: Readonly<Record<string, string>>): InputRow => ({
      rowIndex,
      values: raw,
      original: raw,
    });
    assert.equal(factory.create(row(0, QA_ROW)).rowKey, 'S-01');
    assert.equal(factory.create(row(4, { ...QA_ROW, ID_Scenario: '' })).rowKey, 'r4');
  });
});
