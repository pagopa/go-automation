import type { SENDNotificationRecipient } from './SENDNotificationRecipient.js';
import type { SENDNotificationDocument } from './SENDNotificationDocument.js';
import type { SENDPhysicalCommunicationType } from './SENDPhysicalCommunicationType.js';
import type { SENDNotificationFeePolicy } from './SENDNotificationFeePolicy.js';
import type { SENDPagoPaIntMode } from './SENDPagoPaIntMode.js';

/**
 * Complete notification request
 */
export interface SENDNotificationRequest {
  /** PA protocol number (unique identifier from sender) */
  paProtocolNumber: string;
  /** Notification subject */
  subject: string;
  /** Abstract/summary */
  abstract?: string;
  /** List of recipients */
  recipients: SENDNotificationRecipient[];
  /** List of documents/attachments */
  documents: SENDNotificationDocument[];
  /** Sender PA tax ID */
  senderTaxId: string;
  /** Sender PA denomination/name */
  senderDenomination: string;
  /** Physical communication type */
  physicalCommunicationType: SENDPhysicalCommunicationType;
  /** Taxonomy code */
  taxonomyCode: string;
  /** Notification fee policy */
  notificationFeePolicy: SENDNotificationFeePolicy;
  /** PA fee in euro cents */
  paFee?: number;
  /** VAT in euro cents */
  vat?: number;
  /** PagoPA integration mode */
  pagoPaIntMode?: SENDPagoPaIntMode;
  /** Group ID (for multi-group PAs) */
  group?: string;
  /** Sender email for communications */
  senderPecAddress?: string;
  /** Payment expiration date */
  paymentExpirationDate?: string;
}
