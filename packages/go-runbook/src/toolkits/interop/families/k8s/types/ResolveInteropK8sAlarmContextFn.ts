import type { InteropK8sAlarmContext } from './InteropK8sAlarmContext.js';

/** Resolves the alarm context of an INTEROP alarm from its name. */
export type ResolveInteropK8sAlarmContextFn = (alarmName: string) => InteropK8sAlarmContext;
