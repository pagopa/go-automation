import type { NotificationFeePolicy } from './NotificationFeePolicy.js';
import type { PagoPaIntMode } from './PagoPaIntMode.js';

/**
 * Notification-level options of a record.
 */
export interface DispatchNotificationOptions {
  readonly group?: string;
  readonly taxonomyCode: string;
  readonly notificationFeePolicy: NotificationFeePolicy;
  readonly paFee?: number;
  readonly vat?: number;
  readonly pagoPaIntMode: PagoPaIntMode;
  /** Protocol number from the input; when absent the run derives `GO-<runId>-<rowKey>`. */
  readonly paProtocolNumber?: string;
  readonly paymentExpirationDate?: string;
}
