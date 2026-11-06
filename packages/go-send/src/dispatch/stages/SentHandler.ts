/**
 * Called when a row reaches `SENT`, to hand it to the verification stage.
 */
export type SentHandler = (rowIndex: number, rowKey: string, notificationRequestId: string) => void;
