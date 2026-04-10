import type { SENDPagoPaPayment } from './SENDPagoPaPayment.js';
import type { SENDF24Metadata } from './SENDF24Metadata.js';

/**
 * Payment item for a notification recipient.
 * Each item can contain a PagoPA payment, an F24 metadata, or both.
 * At least one of pagoPa or f24 must be present.
 */
export interface SENDNotificationPaymentItem {
  /** PagoPA payment information */
  pagoPa?: SENDPagoPaPayment;
  /** F24 metadata */
  f24?: SENDF24Metadata;
}
