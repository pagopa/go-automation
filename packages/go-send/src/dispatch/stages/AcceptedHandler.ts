/**
 * Called when a row reaches `ACCEPTED`, to hand it to the requestId stage.
 */
export type AcceptedHandler = (rowIndex: number, rowKey: string, iun: string) => void;
