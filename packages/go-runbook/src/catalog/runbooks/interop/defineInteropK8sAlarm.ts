import { interop } from '../framework.js';

import type { InteropAlarmContext } from './InteropAlarmContext.js';
import type { InteropEnvironment } from './InteropEnvironment.js';
import { INTEROP_ENVIRONMENTS, isInteropEnvironment } from './InteropEnvironment.js';

/** Builds the CloudWatch alarm name a runbook answers to, for one environment. */
type InteropK8sAlarmNameFn = (runbookKey: string, environment: InteropEnvironment) => string;

/**
 * Default alarm naming: the runbook key followed by the environment.
 * `k8s-interop-be-…-errors-prod`.
 */
const defaultAlarmName: InteropK8sAlarmNameFn = (runbookKey, environment) => `${runbookKey}-${environment}`;

/** Resolves the runtime context from the alarm name that fired. */
type InteropK8sResolveContextFn = (alarmName: string) => InteropAlarmContext;

/** What distinguishes one INTEROP k8s alarm runbook from its siblings. */
export interface InteropK8sAlarmSpec {
  /** Runbook key, also the stem of the alarm names. */
  readonly runbookKey: string;
  /** k8s pod app whose application logs the runbook reads. */
  readonly podApp: string;
  /** Prefix of the context vars the pipeline writes (`<prefix>LogCount`, …). */
  readonly varPrefix: string;
  /**
   * Alarm naming, when it is not `<runbookKey>-<environment>`. Some alarms
   * carry the environment in the middle and end with a namespace segment.
   */
  readonly alarmName?: InteropK8sAlarmNameFn;
}

/**
 * Everything a runbook, its known cases and the registry need about one
 * INTEROP k8s alarm.
 */
export interface InteropK8sAlarm {
  readonly runbookKey: string;
  readonly podApp: string;
  readonly varPrefix: string;
  /** Application log group template shared by every INTEROP k8s runbook. */
  readonly logGroup: string;
  /** Every alarm this runbook answers to, one per environment. */
  readonly alarmNames: readonly [string, ...string[]];
  /** Ids of the five pipeline steps, referenced by known cases and tests. */
  readonly stepIds: interop.k8s.InteropK8sRunbookStepIds;
  /** Resolves the runtime context from the alarm name that fired. */
  readonly resolveContext: InteropK8sResolveContextFn;
}

/**
 * Declares one INTEROP k8s alarm runbook.
 *
 * The five siblings differ only in the three identifiers below plus, for
 * `public-catalog`, the shape of the alarm name — everything else (alarm
 * name list, environment pattern, error message, step ids, context) follows
 * from them.
 *
 * @param spec - The identifiers that distinguish this runbook
 * @returns The alarm definition consumed by the runbook, its known cases and the registry
 *
 * @example
 * ```typescript
 * export const BFF = defineInteropK8sAlarm({
 *   runbookKey: 'k8s-interop-be-backend-for-frontend-errors',
 *   podApp: 'interop-be-backend-for-frontend',
 *   varPrefix: 'interopBff',
 * });
 * ```
 */
export function defineInteropK8sAlarm(spec: InteropK8sAlarmSpec): InteropK8sAlarm {
  const buildName = spec.alarmName ?? defaultAlarmName;
  const alarmNames = INTEROP_ENVIRONMENTS.map((environment) => buildName(spec.runbookKey, environment)) as [
    string,
    ...string[],
  ]; // Safe: INTEROP_ENVIRONMENTS is a non-empty tuple.

  // Alarm names are plain slugs, so the environment can be recovered by
  // matching each candidate name rather than by escaping a pattern.
  const environmentByAlarmName = new Map<string, InteropEnvironment>(
    INTEROP_ENVIRONMENTS.map((environment) => [buildName(spec.runbookKey, environment), environment]),
  );

  return {
    runbookKey: spec.runbookKey,
    podApp: spec.podApp,
    varPrefix: spec.varPrefix,
    logGroup: interop.k8s.INTEROP_K8S_APPLICATION_LOG_GROUP_TEMPLATE,
    alarmNames,
    stepIds: interop.k8s.defaultInteropK8sRunbookStepIds(spec.podApp),
    resolveContext(alarmName: string): InteropAlarmContext {
      const environment = environmentByAlarmName.get(alarmName);
      if (!isInteropEnvironment(environment)) {
        // Sorted like the registry/catalog descriptors expose alarmNames.
        const expected = [...alarmNames].sort().join(', ');
        throw new Error(`Unsupported INTEROP alarm name "${alarmName}". Expected one of: ${expected}`);
      }
      return {
        alarmName,
        runbookKey: spec.runbookKey,
        environment,
        podApp: spec.podApp,
        logGroup: interop.k8s.buildInteropK8sApplicationLogGroup(environment),
      };
    },
  };
}
