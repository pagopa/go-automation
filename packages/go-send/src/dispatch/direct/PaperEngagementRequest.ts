import type { PaperEngagementAttachment } from './PaperEngagementAttachment.js';

/**
 * Body of `PUT /external-channels/v1/paper-deliveries-engagements/{requestId}`
 * (§9.2). Absent values are sent as `null`, like the former shell script.
 */
export interface PaperEngagementRequest {
  readonly iun: string | null;
  readonly requestId: string;
  readonly requestPaId: string;
  readonly clientRequestTimeStamp: string;
  readonly productType: string;
  readonly attachments: ReadonlyArray<PaperEngagementAttachment>;
  readonly printType: string;
  readonly receiverName: string;
  readonly receiverNameRow2: string | null;
  readonly receiverAddress: string;
  readonly receiverAddressRow2: string | null;
  readonly receiverCap: string | null;
  readonly receiverCity: string;
  readonly receiverCity2: string | null;
  readonly receiverPr: string | null;
  readonly receiverCountry: string;
  readonly receiverFiscalCode: string;
  readonly senderName: string;
  readonly senderAddress: string | null;
  readonly senderCity: string | null;
  readonly senderPr: string | null;
  readonly senderDigitalAddress: string | null;
  readonly arName: string | null;
  readonly arAddress: string | null;
  readonly arCap: string | null;
  readonly arCity: string | null;
  readonly vas: null;
}
