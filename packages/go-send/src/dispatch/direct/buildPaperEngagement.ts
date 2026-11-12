import type { DirectAttachmentRef } from '../model/DirectAttachmentRef.js';
import type { DispatchRecord } from '../model/DispatchRecord.js';
import type { PaperEngagementAttachment } from './PaperEngagementAttachment.js';
import type { PaperEngagementRequest } from './PaperEngagementRequest.js';

const SAFESTORAGE_SCHEME = 'safestorage://';
const DEFAULT_COUNTRY = 'ITALIA';

/**
 * Builds the pn-external-channels request of a `direct` record (§9.2). Pure.
 *
 * Attachments: the `AAR` first (order 0), then the `ATTO` documents (order
 * 1..n), as `safestorage://` URIs with their SHA-256.
 *
 * @param record - Valid record with `direct` options
 * @param documents - `ATTO` references, in order
 * @param timestamp - `clientRequestTimeStamp` (ISO 8601, time of the send)
 * @returns The request body
 * @throws Error when the record has no `direct` options
 */
export function buildPaperEngagement(
  record: DispatchRecord,
  documents: ReadonlyArray<DirectAttachmentRef>,
  timestamp: string,
): PaperEngagementRequest {
  const direct = record.direct;
  if (direct === undefined) throw new Error(`row ${record.rowKey}: not a direct record`);
  const address = record.physicalAddress;
  const attachments: PaperEngagementAttachment[] = [
    { uri: toUri(direct.aar.key), order: 0, documentType: 'AAR', sha256: direct.aar.sha256 },
    ...documents.map((document, index): PaperEngagementAttachment => ({
      uri: toUri(document.key),
      order: index + 1,
      documentType: 'ATTO',
      sha256: document.sha256,
    })),
  ];
  return {
    iun: record.preset?.iun ?? null,
    requestId: direct.requestId,
    requestPaId: record.sender.taxId,
    clientRequestTimeStamp: timestamp,
    productType: record.product,
    attachments,
    printType: direct.printType,
    receiverName: record.recipient.denomination,
    receiverNameRow2: address.at ?? null,
    receiverAddress: address.address,
    receiverAddressRow2: address.addressDetails ?? null,
    receiverCap: address.zip ?? null,
    receiverCity: address.municipality,
    receiverCity2: address.municipalityDetails ?? null,
    receiverPr: address.province ?? null,
    receiverCountry: address.foreignState ?? DEFAULT_COUNTRY,
    receiverFiscalCode: record.recipient.taxId,
    senderName: record.sender.denomination,
    senderAddress: direct.sender.address ?? null,
    senderCity: direct.sender.city ?? null,
    senderPr: direct.sender.province ?? null,
    senderDigitalAddress: direct.sender.digitalAddress ?? null,
    arName: direct.returnAddress?.name ?? null,
    arAddress: direct.returnAddress?.address ?? null,
    arCap: direct.returnAddress?.zip ?? null,
    arCity: direct.returnAddress?.city ?? null,
    vas: null,
  };
}

function toUri(key: string): string {
  return key.startsWith(SAFESTORAGE_SCHEME) ? key : `${SAFESTORAGE_SCHEME}${key}`;
}
