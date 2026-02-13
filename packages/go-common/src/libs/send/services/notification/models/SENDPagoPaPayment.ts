import type { SENDNotificationDocument } from './SENDNotificationDocument.js';

/**
 * PagoPA payment information
 */
export interface SENDPagoPaPayment {
  /** Notice code (18 digits) */
  noticeCode: string;
  /** Creditor tax ID */
  creditorTaxId: string;
  /** Whether to apply notification cost to the payment (required by API, nullable: false) */
  applyCost: boolean;
  /** Payment attachment (PagoPA form PDF) */
  attachment?: SENDNotificationDocument;
}
