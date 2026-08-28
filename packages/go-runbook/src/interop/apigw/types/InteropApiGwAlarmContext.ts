export interface InteropApiGwAlarmContext {
  readonly alarmName: string;
  readonly runbookKey: string;
  readonly environment: string;
  readonly apiGwId: string;
  readonly apiGwLogGroup: string;
  readonly podApp: string;
  readonly applicationLogGroup: string;
}

export type ResolveInteropApiGwAlarmContextFn = (alarmName: string) => InteropApiGwAlarmContext;
