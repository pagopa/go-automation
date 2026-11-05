import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { InputRow } from '../../input/InputRow.js';
import { BUILT_IN_PROFILES } from '../builtInProfiles.js';
import { buildRecord } from '../buildRecord.js';
import type { CanonicalField } from '../CanonicalField.js';
import { applyFillTransforms, mapRow, mergeFieldValues } from '../mapRow.js';
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
    assert.equal(mapped.get('product'), 'REGISTERED_LETTER_890', 'product names are translated by buildRecord');
  });

  it('takes the first non-empty column when several map the same field', () => {
    const mapped = mapRow({ ...QA_ROW, Prodotto: 'AR' }, QA_TEST_PROFILE);
    assert.equal(mapped.get('product'), 'AR');
  });

  it('sets PEC when a digital address is present (fill transform, after the merge)', () => {
    const mapped = mapRow({ ...QA_ROW, 'Indirizzo PEC': 'mario@pec.it' }, QA_TEST_PROFILE);
    assert.equal(mapped.get('digitalDomicile.type'), undefined, 'fills do not run in mapRow');
    assert.equal(applyFillTransforms(mapped, QA_TEST_PROFILE).get('digitalDomicile.type'), 'PEC');
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

  it('accepts the digital domicile type in any case and rejects other types', () => {
    const row = validValues();
    row.set('digitalDomicile.address', 'mario.rossi@pec.it');
    row.set('digitalDomicile.type', 'pec');
    const lower = buildRecord(0, 'S-01', row, CONTEXT);
    assert.ok(lower.ok);
    assert.deepEqual(lower.record.digitalDomicile, { type: 'PEC', address: 'mario.rossi@pec.it' });

    row.set('digitalDomicile.type', 'EMAIL');
    const other = buildRecord(0, 'S-01', row, CONTEXT);
    assert.ok(!other.ok);
    assert.deepEqual(
      other.issues.map((issue) => `${issue.code}:${issue.field ?? ''}`),
      ['INVALID_ENUM:digitalDomicile.type'],
    );
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

function issueKeys(result: ReturnType<typeof buildRecord>): ReadonlyArray<string> {
  return result.ok ? [] : result.issues.map((issue) => `${issue.code}:${issue.field ?? ''}`).sort();
}

describe('buildRecord: products, options and dates', () => {
  it('translates the API product names (single source: buildRecord)', () => {
    for (const [raw, expected] of [
      ['AR_REGISTERED_LETTER', 'AR'],
      ['registered_letter_890', '890'],
      ['ar', 'AR'],
    ] as const) {
      const row = validValues();
      row.set('product', raw);
      const result = buildRecord(0, 'k', row, CONTEXT);
      assert.ok(result.ok, raw);
      assert.equal(result.record.product, expected);
    }
  });

  it('requires paFee and vat with DELIVERY_MODE', () => {
    const row = validValues();
    row.set('notificationOptions.notificationFeePolicy', 'delivery_mode');
    assert.deepEqual(issueKeys(buildRecord(0, 'k', row, CONTEXT)), [
      'MISSING_FIELD:notificationOptions.paFee',
      'MISSING_FIELD:notificationOptions.vat',
    ]);
    row.set('notificationOptions.paFee', '100');
    row.set('notificationOptions.vat', '22');
    const result = buildRecord(0, 'k', row, CONTEXT);
    assert.ok(result.ok);
    assert.equal(result.record.options.notificationFeePolicy, 'DELIVERY_MODE');
    assert.equal(result.record.options.paFee, 100);
    assert.equal(result.record.options.vat, 22);
  });

  it('bounds vat to 0-100 and names the unit of each integer', () => {
    const row = validValues();
    row.set('notificationOptions.vat', '101');
    const tooHigh = buildRecord(0, 'k', row, CONTEXT);
    assert.deepEqual(issueKeys(tooHigh), ['OUT_OF_RANGE:notificationOptions.vat']);
    row.set('notificationOptions.vat', '-1');
    row.set('notificationOptions.paFee', '1.5');
    const malformed = buildRecord(0, 'k', row, CONTEXT);
    assert.ok(!malformed.ok);
    const messages = malformed.issues.map((issue) => issue.message).join('\n');
    assert.match(messages, /vat "-1" must be a non-negative integer \(percent\)/);
    assert.match(messages, /paFee "1\.5" must be a non-negative integer \(euro cents\)/);
  });

  it('accepts taxonomy codes ending in A or N only', () => {
    const row = validValues();
    row.set('notificationOptions.taxonomyCode', '010101A');
    assert.ok(buildRecord(0, 'k', row, CONTEXT).ok);
    row.set('notificationOptions.taxonomyCode', '010101P');
    assert.deepEqual(issueKeys(buildRecord(0, 'k', row, CONTEXT)), ['INVALID_FORMAT:notificationOptions.taxonomyCode']);
  });

  it('rejects enum values outside the allowed set', () => {
    const row = validValues();
    row.set('notificationOptions.pagoPaIntMode', 'MAYBE');
    row.set('recipient.type', 'XX');
    assert.deepEqual(issueKeys(buildRecord(0, 'k', row, CONTEXT)), [
      'INVALID_ENUM:notificationOptions.pagoPaIntMode',
      'INVALID_ENUM:recipient.type',
    ]);
  });

  it('rejects impossible payment expiration dates', () => {
    const row = validValues();
    row.set('notificationOptions.paymentExpirationDate', '2028-02-29');
    assert.ok(buildRecord(0, 'k', row, CONTEXT).ok, 'leap day');
    for (const date of ['2026-02-31', '2026-04-31', '2027-02-29']) {
      row.set('notificationOptions.paymentExpirationDate', date);
      assert.deepEqual(
        issueKeys(buildRecord(0, 'k', row, CONTEXT)),
        ['INVALID_FORMAT:notificationOptions.paymentExpirationDate'],
        date,
      );
    }
  });

  it('does not read preset identifiers in e2e', () => {
    const row = validValues();
    row.set('preset.iun', 'not-an-iun');
    const result = buildRecord(0, 'k', row, CONTEXT);
    assert.ok(result.ok);
    assert.equal(result.record.preset, undefined);
  });
});

describe('buildRecord: recipient', () => {
  it('upper-cases the tax id and accepts codice fiscale (with omocodia) or partita IVA', () => {
    for (const [raw, expected] of [
      ['rssmra80a01h501u', 'RSSMRA80A01H501U'],
      ['RSSMRA80A01H50RU', 'RSSMRA80A01H50RU'],
      ['MRTMTT91D08F2O5L', undefined],
      ['12345678901', '12345678901'],
    ] as const) {
      const row = validValues();
      row.set('recipient.taxId', raw);
      const result = buildRecord(0, 'k', row, CONTEXT);
      if (expected === undefined) {
        assert.deepEqual(issueKeys(result), ['INVALID_FORMAT:recipient.taxId'], raw);
      } else {
        assert.ok(result.ok, raw);
        assert.equal(result.record.recipient.taxId, expected);
      }
    }
  });

  it('rejects malformed tax ids', () => {
    for (const raw of ['RSSMRA80A01H501', '1234567890', 'RSSMRA80Z01H501U', 'RSSMRA80A01H501U1']) {
      const row = validValues();
      row.set('recipient.taxId', raw);
      assert.deepEqual(issueKeys(buildRecord(0, 'k', row, CONTEXT)), ['INVALID_FORMAT:recipient.taxId'], raw);
    }
  });
});

describe('buildRecord: payment', () => {
  it('is absent without notice code and creditor', () => {
    const result = buildRecord(0, 'k', validValues(), CONTEXT);
    assert.ok(result.ok);
    assert.equal(result.record.payment, undefined);
  });

  it('requires both notice code and creditor, with their formats', () => {
    const row = validValues();
    row.set('payment.noticeCode', '30200001');
    assert.deepEqual(issueKeys(buildRecord(0, 'k', row, CONTEXT)), [
      'INVALID_FORMAT:payment.noticeCode',
      'MISSING_FIELD:payment.creditorTaxId',
    ]);
    row.set('payment.noticeCode', '302000100000019421');
    row.set('payment.creditorTaxId', '7701');
    assert.deepEqual(issueKeys(buildRecord(0, 'k', row, CONTEXT)), ['INVALID_FORMAT:payment.creditorTaxId']);
  });

  it('reads applyCost as a boolean, default false', () => {
    const row = validValues();
    row.set('payment.noticeCode', '302000100000019421');
    row.set('payment.creditorTaxId', '77777777777');
    const byDefault = buildRecord(0, 'k', row, CONTEXT);
    assert.ok(byDefault.ok);
    assert.deepEqual(byDefault.record.payment, {
      noticeCode: '302000100000019421',
      creditorTaxId: '77777777777',
      applyCost: false,
    });
    row.set('payment.applyCost', 'TRUE');
    const applied = buildRecord(0, 'k', row, CONTEXT);
    assert.ok(applied.ok);
    assert.equal(applied.record.payment?.applyCost, true);
    row.set('payment.applyCost', 'yes');
    assert.deepEqual(issueKeys(buildRecord(0, 'k', row, CONTEXT)), ['INVALID_FORMAT:payment.applyCost']);
  });
});

describe('buildRecord: row files', () => {
  it('pairs titles with files by position, also with empty items', () => {
    const row = validValues();
    row.set('documents.files', 'a.pdf|b.pdf|c.pdf');
    row.set('documents.titles', 'A||C');
    const result = buildRecord(0, 'k', row, CONTEXT);
    assert.ok(result.ok);
    assert.deepEqual(result.record.documents, {
      kind: 'rowFiles',
      files: [
        { path: '/docs/a.pdf', title: 'A' },
        { path: '/docs/b.pdf', title: 'b' },
        { path: '/docs/c.pdf', title: 'C' },
      ],
    });

    row.set('documents.files', 'a.pdf||c.pdf');
    row.set('documents.titles', 'A|B|C');
    const skipped = buildRecord(0, 'k', row, CONTEXT);
    assert.ok(skipped.ok);
    assert.deepEqual(skipped.record.documents, {
      kind: 'rowFiles',
      files: [
        { path: '/docs/a.pdf', title: 'A' },
        { path: '/docs/c.pdf', title: 'C' },
      ],
    });
  });

  it('rejects files outside the documents directory', () => {
    for (const file of ['../secret.pdf', '/etc/passwd', 'sub/../../x.pdf', '.']) {
      const row = validValues();
      row.set('documents.files', `ok.pdf|${file}`);
      assert.deepEqual(issueKeys(buildRecord(0, 'k', row, CONTEXT)), ['DOCUMENT_OUTSIDE_DIR:documents.files'], file);
    }
    const row = validValues();
    row.set('documents.files', '/docs/sub/in.pdf|..name.pdf');
    const inside = buildRecord(0, 'k', row, CONTEXT);
    assert.ok(inside.ok);
    assert.deepEqual(
      inside.record.documents.kind === 'rowFiles' ? inside.record.documents.files.map((file) => file.path) : [],
      ['/docs/sub/in.pdf', '/docs/..name.pdf'],
    );
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
