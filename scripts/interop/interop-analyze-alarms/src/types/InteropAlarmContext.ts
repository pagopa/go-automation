export type InteropEnvironment = 'prod' | 'att' | 'test';

export interface InteropAlarmContext {
  readonly alarmName: string;
  readonly environment: InteropEnvironment;
  readonly podApp: string;
  readonly logGroup: string;
}
