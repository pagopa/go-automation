import type { InteropEnvironment } from '../../../environment/InteropEnvironment.js';

export interface InteropK8sAlarmContext {
  readonly alarmName: string;
  readonly runbookKey: string;
  readonly environment: InteropEnvironment;
  readonly podApp: string;
  readonly logGroup: string;
}
