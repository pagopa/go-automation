import type { InteropEnvironment } from '../../../environment/InteropEnvironment.js';
import type { InteropK8sAlarmNameFn } from './InteropK8sAlarmNameFn.js';

/** What distinguishes one INTEROP k8s alarm runbook from its siblings. */
export interface InteropK8sAlarmSpec {
  /** Runbook key, also the stem of the alarm names. */
  readonly runbookKey: string;
  /** k8s pod app whose application logs the runbook reads. */
  readonly podApp: string;
  /** Prefix of the context vars the pipeline writes (`<prefix>LogCount`, …). */
  readonly varPrefix: string;
  /** Documented environments for this alarm; defaults to prod, att and test. */
  readonly environments?: readonly [InteropEnvironment, ...InteropEnvironment[]];
  /**
   * Alarm naming, when it is not `<runbookKey>-<environment>`. Some alarms
   * carry the environment in the middle and end with a namespace segment.
   */
  readonly alarmName?: InteropK8sAlarmNameFn;
}
