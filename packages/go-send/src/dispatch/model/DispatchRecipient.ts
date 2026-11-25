import type { RecipientType } from './RecipientType.js';

/**
 * Recipient of a notification.
 */
export interface DispatchRecipient {
  readonly type: RecipientType;
  readonly taxId: string;
  readonly denomination: string;
}
