/**
 * Response when creating a notification
 */
export interface SENDNotificationCreationResponse {
  /** Notification request ID */
  notificationRequestId: string;
  /** PA protocol number */
  paProtocolNumber: string;
  /** IUN (if already available) */
  iun?: string | undefined;
}
