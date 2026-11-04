/**
 * Identifiers of a notification already sent, both resolved and consistent:
 * `notificationRequestId` is the Base64 of `iun` (A1).
 */
export interface ResolvedPresetIds {
  readonly iun: string;
  readonly notificationRequestId: string;
}
