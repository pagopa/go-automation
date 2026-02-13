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
  /** Notification subject (max 134 chars) */
  subject: string;
  /** Abstract/summary (max 1024 chars) */
  abstract?: string;
  /** Idempotence token for retry on rejected requests (max 256 chars) */
  idempotenceToken?: string;
  /** IUN of the notification to cancel */
  cancelledIun?: string;
  /** Notification amount in euro cents */
  amount?: number;
  /** List of recipients */
  recipients: SENDNotificationRecipient[];
  /** List of documents/attachments (min 1) */
  documents: SENDNotificationDocument[];
  /** Sender PA tax ID */
  senderTaxId: string;
  /** Sender PA denomination/name */
  senderDenomination: string;
  /** Physical communication type */
  physicalCommunicationType: SENDPhysicalCommunicationType;
  /** Taxonomy code (pattern: 6 digits + 1 letter, e.g. '010202N') */
  taxonomyCode: string;
  /** Notification fee policy */
  notificationFeePolicy: SENDNotificationFeePolicy;
  /** PA fee in euro cents (required when notificationFeePolicy=DELIVERY_MODE, default 100) */
  paFee?: number;
  /** VAT percentage (required when notificationFeePolicy=DELIVERY_MODE, default 22) */
  vat?: number;
  /** PagoPA integration mode */
  pagoPaIntMode?: SENDPagoPaIntMode;
  /** Group ID (for multi-group PAs, max 1024 chars) */
  group?: string;
  /** Payment expiration date (format: YYYY-MM-DD) */
  paymentExpirationDate?: string;
}
