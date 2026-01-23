import type { SENDNotificationDocument } from './SENDNotificationDocument.js';

/**
 * PagoPA payment information
 */
export interface SENDPagoPaPayment {
  /** Notice code (18 digits) */
  noticeCode: string;
  /** Creditor tax ID */
  creditorTaxId: string;
  /** Whether to apply cost to citizen */
  applyCost?: boolean;
  /** Payment attachment (PagoPA form PDF) */
  pagoPaForm?: SENDNotificationDocument;
}
