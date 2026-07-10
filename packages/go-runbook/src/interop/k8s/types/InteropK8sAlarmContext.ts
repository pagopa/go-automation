export interface InteropK8sAlarmContext {
  readonly alarmName: string;
  readonly runbookKey: string;
  readonly environment: string;
  readonly podApp: string;
  readonly logGroup: string;
}

export type ResolveInteropK8sAlarmContextFn = (alarmName: string) => InteropK8sAlarmContext;
