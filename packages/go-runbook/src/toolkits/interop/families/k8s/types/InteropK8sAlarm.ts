import type { ResolveInteropAlarmContextFn } from '../../../alarms/ResolveInteropAlarmContextFn.js';
import type { InteropK8sAlarmContext } from './InteropK8sAlarmContext.js';
import type { InteropK8sRunbookStepIds } from './InteropK8sRunbookStepIds.js';

/**
 * Everything a runbook, its known errors and the registry need about one
 * INTEROP k8s alarm.
 */
export interface InteropK8sAlarm {
  readonly runbookKey: string;
  readonly podApp: string;
  readonly varPrefix: string;
  /** Application log group template shared by every INTEROP k8s runbook. */
  readonly logGroup: string;
  /** Every alarm this runbook answers to, one per supported environment. */
  readonly alarmNames: readonly [string, ...string[]];
  /** Ids of the five pipeline steps, referenced by known errors and tests. */
  readonly stepIds: InteropK8sRunbookStepIds;
  /** Resolves the runtime context from the alarm name that fired. */
  readonly resolveContext: ResolveInteropAlarmContextFn<InteropK8sAlarmContext>;
}
