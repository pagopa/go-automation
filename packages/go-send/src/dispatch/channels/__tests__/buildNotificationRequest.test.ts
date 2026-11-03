import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { DispatchRecord } from '../../model/DispatchRecord.js';
import type { DocumentRef } from '../../model/DocumentRef.js';
import { buildNotificationRequest } from '../buildNotificationRequest.js';

/**
 * Contract of `NewNotificationRequestV26` (pn-delivery
 * `docs/openapi/api-external-b2b-pa-bundle.yaml`): allowed and required
 * properties, and the formats the payload must respect.
 */
const V26_PROPERTIES = new Set([
  'idempotenceToken',
  'paProtocolNumber',
  'subject',
  'abstract',
  'recipients',
  'documents',
  'notificationFeePolicy',
  'cancelledIun',
  'physicalCommunicationType',
  'senderDenomination',
  'senderTaxId',
  'group',
  'amount',
  'paymentExpirationDate',
  'taxonomyCode',
  'paFee',
  'vat',
  'pagoPaIntMode',
  'additionalLanguages',
  'physicalCommunicationPriority',
]);
const V26_REQUIRED = [
  'paProtocolNumber',
  'subject',
  'recipients',
  'documents',
  'physicalCommunicationType',
  'notificationFeePolicy',
  'senderDenomination',
  'senderTaxId',
  'taxonomyCode',
];
const RECIPIENT_PROPERTIES = new Set([
  'recipientType',
  'taxId',
  'denomination',
  'digitalDomicile',
  'physicalAddress',
  'payments',
]);
const ADDRESS_PROPERTIES = new Set([
  'at',
  'address',
  'addressDetails',
  'zip',
  'municipality',
  'municipalityDetails',
  'province',
  'foreignState',
]);
const DOCUMENT_PROPERTIES = new Set(['digests', 'contentType', 'ref', 'title', 'docIdx']);

const RECORD: DispatchRecord = {
  rowIndex: 0,
  rowKey: 'S-01',
  subject: 'Test',
  sender: { taxId: '00000000001', denomination: 'Comune di Test' },
  recipient: { type: 'PF', taxId: 'RSSMRA80A01H501U', denomination: 'Mario Rossi' },
  physicalAddress: { address: 'Via Roma 1', zip: '00100', municipality: 'Roma', province: 'RM' },
  digitalDomicile: { type: 'PEC', address: 'mario@pec.it' },
  product: '890',
  documents: { kind: 'shared' },
  payment: { noticeCode: '302000000000000001', creditorTaxId: '00000000001', applyCost: false },
  options: { group: 'group-1', taxonomyCode: '010202N', notificationFeePolicy: 'FLAT_RATE', pagoPaIntMode: 'NONE' },
};

const DOCUMENT: DocumentRef = {
  key: 'PN_NOTIFICATION_ATTACHMENTS-abc.pdf',
  versionToken: 'v1',
  sha256: '1QKD/Ks6BohyQ+bgMxHf9NrpNhVmGUPxRYE1aerU4JQ=',
  contentType: 'application/pdf',
  title: 'Atto',
};

function assertOnly(value: object, allowed: ReadonlySet<string>, where: string): void {
  for (const key of Object.keys(value)) assert.ok(allowed.has(key), `${where}: unexpected property ${key}`);
}

describe('buildNotificationRequest (contract v2.6)', () => {
  const ids = { paProtocolNumber: 'GO-run-S-01', idempotenceToken: 'run-S-01' };

  it('produces a payload accepted by NewNotificationRequestV26', () => {
    const request = buildNotificationRequest(RECORD, [DOCUMENT], ids);
    assertOnly(request, V26_PROPERTIES, 'request');
    for (const field of V26_REQUIRED) assert.ok(field in request, `missing ${field}`);

    assert.equal(request.paProtocolNumber, ids.paProtocolNumber);
    assert.equal(request.idempotenceToken, ids.idempotenceToken);
    assert.match(request.idempotenceToken ?? '', /^[ -~]{1,256}$/);
    assert.match(request.senderTaxId, /^\d{1,11}$/);
    assert.match(request.taxonomyCode, /^\d{6}[A-Z]$/);
    assert.equal(request.physicalCommunicationType, 'REGISTERED_LETTER_890');
    assert.equal(request.group, 'group-1');

    const [recipient] = request.recipients;
    assert.ok(recipient !== undefined);
    assertOnly(recipient, RECIPIENT_PROPERTIES, 'recipient');
    assertOnly(recipient.physicalAddress, ADDRESS_PROPERTIES, 'physicalAddress');
    assert.deepEqual(recipient.digitalDomicile, { type: 'PEC', address: 'mario@pec.it' });
    assert.deepEqual(recipient.payments, [
      { pagoPa: { noticeCode: '302000000000000001', creditorTaxId: '00000000001', applyCost: false } },
    ]);

    const [document] = request.documents;
    assert.ok(document !== undefined);
    assertOnly(document, DOCUMENT_PROPERTIES, 'document');
    assert.equal(document.contentType, 'application/pdf');
    assert.match(document.digests.sha256, /^[A-Za-z0-9+/]{43}=$/);
    assert.equal(document.docIdx, undefined, 'single document: no docIdx');
  });

  it('numbers documents only when there are several', () => {
    const request = buildNotificationRequest(RECORD, [DOCUMENT, { ...DOCUMENT, key: 'K2', title: 'Allegato' }], ids);
    assert.deepEqual(
      request.documents.map((document) => document.docIdx),
      ['0', '1'],
    );
    for (const document of request.documents) assert.match(document.docIdx ?? '', /^\d{1,3}$/);
  });

  it('omits digital domicile, payment and group when absent', () => {
    const { digitalDomicile: _d, payment: _p, ...analog } = RECORD;
    const { group: _g, ...options } = RECORD.options;
    const record: DispatchRecord = { ...analog, product: 'AR', options };
    const request = buildNotificationRequest(record, [DOCUMENT], ids);
    assert.equal(request.physicalCommunicationType, 'AR_REGISTERED_LETTER');
    assert.equal(request.recipients[0]?.digitalDomicile, undefined);
    assert.equal(request.recipients[0]?.payments, undefined);
    assert.equal('group' in request, false);
  });
});
