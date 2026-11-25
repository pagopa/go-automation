/**
 * Sender of a notification (the PA that owns the API key).
 */
export interface DispatchSender {
  readonly taxId: string;
  readonly denomination: string;
}
