import { SENDNotificationBuilder } from '../../builders/SENDNotificationBuilder.js';
import type { SENDNotificationFeePolicy } from '../../services/notification/models/SENDNotificationFeePolicy.js';
import type { SENDNotificationRequest } from '../../services/notification/models/SENDNotificationRequest.js';
import type { SENDPagoPaIntMode } from '../../services/notification/models/SENDPagoPaIntMode.js';
import type { SENDPhysicalAddress } from '../../services/notification/models/SENDPhysicalAddress.js';
import { SENDPhysicalCommunicationType } from '../../services/notification/models/SENDPhysicalCommunicationType.js';
import type { SENDRecipientType } from '../../services/notification/models/SENDRecipientType.js';
import type { RowIdentifiers } from '../ids/RowIdentifiers.js';
import type { DispatchRecord } from '../model/DispatchRecord.js';
import type { DocumentRef } from '../model/DocumentRef.js';

/**
 * Builds the `POST requests` payload of a record (`e2e`), with the
 * deterministic idempotency keys of the row. Pure.
 *
 * `docIdx` is set only for notifications with more than one document, as the
 * former script did.
 *
 * @param record - Valid record
 * @param documents - Resolved documents, in `docIdx` order
 * @param ids - Protocol number and idempotence token of the row
 * @returns The request body
 */
export function buildNotificationRequest(
  record: DispatchRecord,
  documents: ReadonlyArray<DocumentRef>,
  ids: RowIdentifiers,
): SENDNotificationRequest {
  const builder = new SENDNotificationBuilder()
    .setProtocolNumber(ids.paProtocolNumber)
    .setSubject(record.subject)
    .setSender(record.sender.taxId, record.sender.denomination)
    .setPhysicalCommunicationType(
      record.product === '890'
        ? SENDPhysicalCommunicationType.REGISTERED_LETTER_890
        : SENDPhysicalCommunicationType.AR_REGISTERED_LETTER,
    )
    .setTaxonomyCode(record.options.taxonomyCode)
    .setNotificationFeePolicy(record.options.notificationFeePolicy as SENDNotificationFeePolicy)
    .setPagoPaIntMode(record.options.pagoPaIntMode as SENDPagoPaIntMode);

  const { options } = record;
  if (record.abstract !== undefined) builder.setAbstract(record.abstract);
  if (options.group !== undefined) builder.setGroup(options.group);
  if (options.paFee !== undefined) builder.setPaFee(options.paFee);
  if (options.vat !== undefined) builder.setVat(options.vat);
  if (options.paymentExpirationDate !== undefined) builder.setPaymentExpirationDate(options.paymentExpirationDate);

  const address = toPhysicalAddress(record);
  const recipientType = record.recipient.type as SENDRecipientType;
  if (record.digitalDomicile === undefined) {
    builder.addAnalogRecipient(record.recipient.taxId, record.recipient.denomination, address, recipientType);
  } else {
    builder.addDigitalRecipient(
      record.recipient.taxId,
      record.recipient.denomination,
      address,
      { type: record.digitalDomicile.type, address: record.digitalDomicile.address },
      recipientType,
    );
  }
  if (record.payment !== undefined) {
    builder.addPagoPaPaymentToLastRecipient({
      noticeCode: record.payment.noticeCode,
      creditorTaxId: record.payment.creditorTaxId,
      applyCost: record.payment.applyCost,
    });
  }

  const assignDocIdx = documents.length > 1;
  for (const [index, document] of documents.entries()) {
    builder.addDocumentManual({
      title: document.title,
      contentType: document.contentType,
      ref: { key: document.key, versionToken: document.versionToken },
      digests: { sha256: document.sha256 },
      ...(assignDocIdx && { docIdx: String(index) }),
    });
  }

  return { ...builder.build(), idempotenceToken: ids.idempotenceToken };
}

function toPhysicalAddress(record: DispatchRecord): SENDPhysicalAddress {
  const source = record.physicalAddress;
  return {
    address: source.address,
    municipality: source.municipality,
    ...(source.at !== undefined && { at: source.at }),
    ...(source.addressDetails !== undefined && { addressDetails: source.addressDetails }),
    ...(source.zip !== undefined && { zip: source.zip }),
    ...(source.municipalityDetails !== undefined && { municipalityDetails: source.municipalityDetails }),
    ...(source.province !== undefined && { province: source.province }),
    ...(source.foreignState !== undefined && { foreignState: source.foreignState }),
  };
}
