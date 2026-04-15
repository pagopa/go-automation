/**
 * Notification status response
 */
export interface SENDNotificationStatusResponse {
  /** Notification request ID */
  notificationRequestId: string;
  /** Notification status */
  notificationRequestStatus: string;
  /** IUN (Identificativo Univoco Notifica) */
  iun?: string | undefined;
  /** List of errors (if any) - can be strings or error objects */
  errors?: (string | Record<string, unknown>)[] | undefined;
}
