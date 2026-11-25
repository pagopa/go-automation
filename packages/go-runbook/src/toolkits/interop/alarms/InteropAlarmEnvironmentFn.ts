import type { InteropEnvironment } from '../environment/InteropEnvironment.js';

/** The INTEROP environment of an alarm name, or an error when the runbook does not answer to that alarm. */
export type InteropAlarmEnvironmentFn = (alarmName: string) => InteropEnvironment;
