import type { SENDRecipientType } from './SENDRecipientType.js';
import type { SENDPhysicalAddress } from './SENDPhysicalAddress.js';
import type { SENDDigitalDomicile } from './SENDDigitalDomicile.js';
import type { SENDNotificationPaymentItem } from './SENDNotificationPaymentItem.js';

/**
 * Notification recipient (aligned with NotificationRecipientV23)
 */
export interface SENDNotificationRecipient {
  /** Recipient type (PF/PG) */
  recipientType: SENDRecipientType;
  /** Tax ID / Fiscal code */
  taxId: string;
  /** Recipient name/denomination */
  denomination: string;
  /** Physical address (required by API for all recipients) */
  physicalAddress: SENDPhysicalAddress;
  /** Digital domicile (for digital notifications) */
  digitalDomicile?: SENDDigitalDomicile;
  /** Payment items (each can contain pagoPa, f24, or both) */
  payments?: SENDNotificationPaymentItem[];
}
