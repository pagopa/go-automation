import type { InteropApiGwAlarmContext } from './InteropApiGwAlarmContext.js';

/** Resolves the alarm context of an INTEROP alarm from its name. */
export type ResolveInteropApiGwAlarmContextFn = (alarmName: string) => InteropApiGwAlarmContext;
