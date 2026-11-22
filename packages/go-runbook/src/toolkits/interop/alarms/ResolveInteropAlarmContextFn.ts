/** Resolves the context of an INTEROP alarm from the name of the alarm that fired. */
export type ResolveInteropAlarmContextFn<TContext> = (alarmName: string) => TContext;
