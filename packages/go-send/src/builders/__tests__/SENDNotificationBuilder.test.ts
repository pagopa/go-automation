import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { SENDDigitalDomicile } from '../../services/notification/models/SENDDigitalDomicile.js';
import type { SENDNotificationDocument } from '../../services/notification/models/SENDNotificationDocument.js';
import type { SENDPhysicalAddress } from '../../services/notification/models/SENDPhysicalAddress.js';
import { SENDRecipientType } from '../../services/notification/models/SENDRecipientType.js';
import { SENDNotificationBuilder } from '../SENDNotificationBuilder.js';

const ADDRESS: SENDPhysicalAddress = { address: 'Via Roma 1', zip: '00100', municipality: 'Roma' };
const DOMICILE: SENDDigitalDomicile = { type: 'PEC', address: 'mario.rossi@pec.example.it' };
const DOCUMENT: SENDNotificationDocument = {
  title: 'Documento',
  contentType: 'application/pdf',
  ref: { key: 'safe-storage-key', versionToken: 'version-token' },
  digests: { sha256: 'digest' },
};

function builderWithRequiredFields(): SENDNotificationBuilder {
  return new SENDNotificationBuilder()
    .setProtocolNumber('PROT-1')
    .setSubject('Oggetto')
    .setSender('12345678901', 'PagoPA')
    .addDocumentManual(DOCUMENT);
}

describe('SENDNotificationBuilder', () => {
  it('adds a mixed recipient with both addresses and the default recipient type', () => {
    const request = builderWithRequiredFields()
      .addMixedRecipient('RSSMRA80A01H501U', 'Mario Rossi', ADDRESS, DOMICILE)
      .build();

    assert.deepStrictEqual(request.recipients, [
      {
        taxId: 'RSSMRA80A01H501U',
        denomination: 'Mario Rossi',
        recipientType: SENDRecipientType.PF,
        physicalAddress: ADDRESS,
        digitalDomicile: DOMICILE,
      },
    ]);
  });

  it('adds the same recipient from addMixedRecipient and addDigitalRecipient', () => {
    const mixed = builderWithRequiredFields()
      .addMixedRecipient('RSSMRA80A01H501U', 'Mario Rossi', ADDRESS, DOMICILE, SENDRecipientType.PG)
      .build();
    const digital = builderWithRequiredFields()
      .addDigitalRecipient('RSSMRA80A01H501U', 'Mario Rossi', ADDRESS, DOMICILE, SENDRecipientType.PG)
      .build();

    assert.deepStrictEqual(mixed.recipients, digital.recipients);
  });
});
