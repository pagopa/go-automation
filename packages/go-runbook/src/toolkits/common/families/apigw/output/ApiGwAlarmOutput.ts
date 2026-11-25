export interface ApiGwAlarmOutput {
  readonly name?: string;
  readonly datetime?: string;
  readonly datetimeEnd?: string;
  readonly timeRange?: {
    readonly start?: string;
    readonly end?: string;
  };
}
