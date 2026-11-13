import type { InteropEnvironment } from '../../../environment/InteropEnvironment.js';

export interface InteropApiGwAlarmContext {
  readonly alarmName: string;
  readonly runbookKey: string;
  readonly environment: InteropEnvironment;
  readonly apiGwId: string;
  readonly apiGwLogGroup: string;
  readonly podApp: string;
  readonly applicationLogGroup: string;
}
