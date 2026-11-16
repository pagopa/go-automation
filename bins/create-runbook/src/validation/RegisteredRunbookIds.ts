/** Identity of a registered runbook: its key and every alarm name it answers to (aliases included). */
export interface RegisteredRunbookIds {
  readonly key: string;
  readonly alarmNames: ReadonlyArray<string>;
}
