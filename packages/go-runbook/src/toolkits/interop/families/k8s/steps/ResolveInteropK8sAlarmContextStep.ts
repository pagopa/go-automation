import { ResolveInteropAlarmContextStep } from '../../../alarms/ResolveInteropAlarmContextStep.js';
import type { ResolveInteropAlarmContextFn } from '../../../alarms/ResolveInteropAlarmContextFn.js';
import type { InteropK8sAlarmContext } from '../types/InteropK8sAlarmContext.js';

export interface ResolveInteropK8sAlarmContextStepConfig {
  readonly id: string;
  readonly label: string;
  readonly resolveAlarmContext: ResolveInteropAlarmContextFn<InteropK8sAlarmContext>;
}

const RESOLVER_ID = 'interop-k8s-alarm-context';

/**
 * First step of an INTEROP k8s alarm runbook: environment, pod app and log group of the alarm that fired.
 *
 * @example
 * ```typescript
 * new ResolveInteropK8sAlarmContextStep({ id: 'resolve-interop-alarm-context', label: '…', resolveAlarmContext });
 * ```
 */
export class ResolveInteropK8sAlarmContextStep extends ResolveInteropAlarmContextStep<InteropK8sAlarmContext> {
  /**
   * @param config - Id, label and resolver of the context
   */
  constructor(config: ResolveInteropK8sAlarmContextStepConfig) {
    super(config.id, config.label, config.resolveAlarmContext);
  }

  protected override resolver(): string {
    return RESOLVER_ID;
  }

  protected override familyName(): string {
    return 'k8s';
  }

  protected override describe(alarmContext: InteropK8sAlarmContext): ReadonlyArray<string> {
    return [
      `Ambiente INTEROP: ${alarmContext.environment}`,
      `Pod app: ${alarmContext.podApp}`,
      `Log group: ${alarmContext.logGroup}`,
    ];
  }

  protected override contextVars(alarmContext: InteropK8sAlarmContext): Readonly<Record<string, string>> {
    return {
      interopEnvironment: alarmContext.environment,
      interopPodApp: alarmContext.podApp,
      interopLogGroup: alarmContext.logGroup,
      interopRunbookKey: alarmContext.runbookKey,
    };
  }
}
