/**
 * A row already sent, imported for the phases after `send` (RF-12).
 */
export interface PresetRow {
  readonly rowIndex: number;
  readonly rowKey: string;
  readonly iun: string;
  readonly notificationRequestId: string;
}
