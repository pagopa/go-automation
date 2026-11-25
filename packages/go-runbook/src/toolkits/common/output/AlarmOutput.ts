/** Alarm identity and occurrence window included in the output details. */
export interface AlarmOutput {
  readonly name?: string;
  readonly datetime?: string;
  readonly datetimeEnd?: string;
  readonly timeRange: {
    readonly start?: string;
    readonly end?: string;
  };
}
