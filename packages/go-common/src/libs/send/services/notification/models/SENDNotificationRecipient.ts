import type { SENDRecipientType } from './SENDRecipientType.js';
import type { SENDPhysicalAddress } from './SENDPhysicalAddress.js';
import type { SENDDigitalDomicile } from './SENDDigitalDomicile.js';
import type { SENDPagoPaPayment } from './SENDPagoPaPayment.js';
import type { SENDF24Metadata } from './SENDF24Metadata.js';

/**
 * Notification recipient
 */
export interface SENDNotificationRecipient {
  /** Recipient type (PF/PG) */
  recipientType: SENDRecipientType;
  /** Tax ID / Fiscal code */
  taxId: string;
  /** Recipient name/denomination */
  denomination: string;
  /** Physical address (for analog notifications) */
  physicalAddress?: SENDPhysicalAddress;
  /** Digital domicile (for digital notifications) */
  digitalDomicile?: SENDDigitalDomicile;
  /** Payment information */
  payment?: SENDPagoPaPayment;
  /** F24 metadata */
  payments?: Array<SENDPagoPaPayment | SENDF24Metadata>;
}
